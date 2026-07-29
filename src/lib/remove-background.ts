import { loadImage } from "@/lib/image-utils";
import { resolveProcessingDevice } from "@/lib/runtime-capabilities";
import type { MatteAlgorithm, PreloadOptions, ProcessingDevice, RemoveOptions } from "@/types/processing";

const describe = (key: string): string => {
	if (key.startsWith("fetch")) return "Downloading model";
	if (key.startsWith("compute")) return "Removing background";
	return "Working";
};

const runtimeConfig = (options: Pick<RemoveOptions, "model">, device: "cpu" | "gpu") => {
	return {
		model: options.model,
		device,
		output: { format: "image/png" as const },
	};
};

const isWebGpuBackendError = (error: unknown): boolean => {
	const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
	return /webgpu|no available backend/i.test(message);
};

const shouldRetryWithCpu = (device: ProcessingDevice, error: unknown): boolean => {
	return device === "auto" && isWebGpuBackendError(error);
};

const encodePng = async (canvas: HTMLCanvasElement): Promise<Blob> => {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode refined cutout"))), "image/png");
	});
};

const blurAlpha = (rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
	const pixelCount = width * height;
	const horizontal = new Uint8ClampedArray(pixelCount);
	const result = new Uint8ClampedArray(pixelCount);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let sum = 0;
			let count = 0;
			for (let offset = -1; offset <= 1; offset += 1) {
				const sampleX = Math.max(0, Math.min(width - 1, x + offset));
				sum += rgba[(y * width + sampleX) * 4 + 3];
				count += 1;
			}
			horizontal[y * width + x] = sum / count;
		}
	}

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let sum = 0;
			let count = 0;
			for (let offset = -1; offset <= 1; offset += 1) {
				const sampleY = Math.max(0, Math.min(height - 1, y + offset));
				sum += horizontal[sampleY * width + x];
				count += 1;
			}
			const index = y * width + x;
			const original = rgba[index * 4 + 3];
			result[index] = Math.round(original * 0.55 + (sum / count) * 0.45);
		}
	}

	return result;
};

const enhanceHairAlpha = (rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
	const result = new Uint8ClampedArray(width * height);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x;
			const current = rgba[pixel * 4 + 3];
			if (current === 0 || current === 255) {
				result[pixel] = current;
				continue;
			}

			const left = rgba[(y * width + Math.max(0, x - 1)) * 4 + 3];
			const right = rgba[(y * width + Math.min(width - 1, x + 1)) * 4 + 3];
			const above = rgba[(Math.max(0, y - 1) * width + x) * 4 + 3];
			const below = rgba[(Math.min(height - 1, y + 1) * width + x) * 4 + 3];
			const average = (current + left + right + above + below) / 5;
			const unsharp = current + (current - average) * 0.85;
			const normalized = current / 255;
			const curved = normalized < 0.5 ? 0.5 * (normalized * 2) ** 1.12 : 1 - 0.5 * ((1 - normalized) * 2) ** 1.12;
			let enhanced = unsharp * 0.72 + curved * 255 * 0.28;
			if (current > average) enhanced = Math.max(current, enhanced);
			result[pixel] = Math.round(Math.max(0, Math.min(255, enhanced)));
		}
	}
	return result;
};

const applyMatteAlgorithm = async (blob: Blob, algorithm: MatteAlgorithm): Promise<Blob> => {
	if (algorithm === "natural") return blob;

	const url = URL.createObjectURL(blob);
	try {
		const image = await loadImage(url);
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Canvas is not available");
		context.drawImage(image, 0, 0);

		const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
		const adjustedAlpha =
			algorithm === "soft"
				? blurAlpha(imageData.data, canvas.width, canvas.height)
				: algorithm === "hair"
					? enhanceHairAlpha(imageData.data, canvas.width, canvas.height)
					: undefined;
		const pixelCount = canvas.width * canvas.height;
		for (let pixel = 0; pixel < pixelCount; pixel += 1) {
			const current = adjustedAlpha?.[pixel] ?? imageData.data[pixel * 4 + 3];
			if (algorithm === "hard") {
				imageData.data[pixel * 4 + 3] = current >= 128 ? 255 : 0;
			} else if (algorithm === "refine") {
				const normalized = Math.max(0, Math.min(1, (current / 255 - 0.16) / 0.68));
				imageData.data[pixel * 4 + 3] = Math.round(normalized * normalized * (3 - 2 * normalized) * 255);
			} else {
				imageData.data[pixel * 4 + 3] = current;
			}
		}

		context.putImageData(imageData, 0, 0);
		return encodePng(canvas);
	} finally {
		URL.revokeObjectURL(url);
	}
};

export const preloadBackgroundModel = async (options: PreloadOptions): Promise<void> => {
	const { preload } = await import("@imgly/background-removal");
	const runPreload = async (device: ProcessingDevice): Promise<void> => {
		const resolvedDevice = await resolveProcessingDevice(device);
		await preload({
			...runtimeConfig(options, resolvedDevice),
			progress: (key: string, current: number, total: number) => {
				const fraction = total > 0 ? Math.min(1, current / total) : 0;
				options.onProgress?.(fraction, describe(key));
			},
		});
	};

	try {
		await runPreload(options.device);
	} catch (error) {
		if (!shouldRetryWithCpu(options.device, error)) throw error;
		options.onProgress?.(0, "WebGPU unavailable; retrying with CPU");
		await runPreload("cpu");
	}
};

/**
 * Runs the background removal entirely in the browser (WASM).
 * The library is imported lazily so the ~large model runtime never touches SSR.
 */
export const removeImageBackground = async (file: File | Blob, options: RemoveOptions): Promise<Blob> => {
	const { removeBackground } = await import("@imgly/background-removal");
	const runRemoval = async (device: ProcessingDevice): Promise<Blob> => {
		const resolvedDevice = await resolveProcessingDevice(device);
		return removeBackground(file, {
			...runtimeConfig(options, resolvedDevice),
			progress: (key: string, current: number, total: number) => {
				const fraction = total > 0 ? Math.min(0.9, (current / total) * 0.9) : 0;
				options.onProgress?.(fraction, describe(key));
			},
		});
	};

	let cutout: Blob;
	try {
		cutout = await runRemoval(options.device);
	} catch (error) {
		if (!shouldRetryWithCpu(options.device, error)) throw error;
		options.onProgress?.(0, "WebGPU unavailable; retrying with CPU");
		cutout = await runRemoval("cpu");
	}

	options.onProgress?.(0.94, options.algorithm === "natural" ? "Finalizing cutout" : options.algorithm === "hair" ? "Sharpening fine edges" : "Refining edges");
	const refined = await applyMatteAlgorithm(cutout, options.algorithm);
	options.onProgress?.(1, "Done");
	return refined;
};
