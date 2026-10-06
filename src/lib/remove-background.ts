import { loadImage, MAX_CANVAS_SIDE } from "@/lib/image-utils";
import { MODEL_INPUT_MEAN, MODEL_INPUT_STD } from "@/lib/model-registry";
import { getSegmentationSession, type SegmentationSession } from "@/lib/onnx-runtime";
import { resolveProcessingDevice } from "@/lib/runtime-capabilities";
import type { MatteAlgorithm, PreloadOptions, ProcessingDevice, RemoveOptions } from "@/types/processing";

/** Share of the progress bar reserved for downloading the selected model. */
const DOWNLOAD_SHARE = 0.5;

const isWebGpuBackendError = (error: unknown): boolean => {
	const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
	return /webgpu|no available backend/i.test(message);
};

const shouldRetryWithCpu = (device: ProcessingDevice, error: unknown): boolean => {
	return device === "auto" && isWebGpuBackendError(error);
};

const runOnDevice = async <T>(device: ProcessingDevice, run: (device: "cpu" | "gpu") => Promise<T>, onFallback: () => void): Promise<T> => {
	const resolved = await resolveProcessingDevice(device);
	try {
		return await run(resolved);
	} catch (error) {
		if (!shouldRetryWithCpu(device, error)) throw error;
		onFallback();
		return run("cpu");
	}
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
		const naturalWidth = image.naturalWidth;
		const naturalHeight = image.naturalHeight;

		// Work at a resolution the device can safely hold in memory. A large
		// photo would otherwise allocate hundreds of MB of ImageData and can
		// crash the tab; the refined result is upscaled back to full size.
		const refinementScale = Math.min(1, MAX_CANVAS_SIDE / Math.max(naturalWidth, naturalHeight));
		const width = Math.max(1, Math.round(naturalWidth * refinementScale));
		const height = Math.max(1, Math.round(naturalHeight * refinementScale));

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Canvas is not available");
		context.drawImage(image, 0, 0, width, height);

		const imageData = context.getImageData(0, 0, width, height);
		const adjustedAlpha =
			algorithm === "soft"
				? blurAlpha(imageData.data, width, height)
				: algorithm === "hair"
					? enhanceHairAlpha(imageData.data, width, height)
					: undefined;
		const pixelCount = width * height;
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
		if (refinementScale === 1) return encodePng(canvas);

		const outputCanvas = document.createElement("canvas");
		outputCanvas.width = naturalWidth;
		outputCanvas.height = naturalHeight;
		const outputContext = outputCanvas.getContext("2d");
		if (!outputContext) throw new Error("Canvas is not available");
		outputContext.imageSmoothingQuality = "high";
		outputContext.drawImage(canvas, 0, 0, naturalWidth, naturalHeight);
		return encodePng(outputCanvas);
	} finally {
		URL.revokeObjectURL(url);
	}
};

/** Converts RGBA pixels into the normalized planar RGB tensor the model expects. */
const normalizePixels = (rgba: Uint8ClampedArray, size: number): Float32Array => {
	const stride = size * size;
	const planar = new Float32Array(3 * stride);
	for (let pixel = 0, offset = 0; pixel < stride; pixel += 1, offset += 4) {
		planar[pixel] = (rgba[offset] - MODEL_INPUT_MEAN) / MODEL_INPUT_STD;
		planar[pixel + stride] = (rgba[offset + 1] - MODEL_INPUT_MEAN) / MODEL_INPUT_STD;
		planar[pixel + 2 * stride] = (rgba[offset + 2] - MODEL_INPUT_MEAN) / MODEL_INPUT_STD;
	}
	return planar;
};

/** Runs the IS-Net session and composites the returned mask onto the full-size source. */
const segmentImage = async (file: File | Blob, session: SegmentationSession): Promise<Blob> => {
	const url = URL.createObjectURL(file);
	try {
		const image = await loadImage(url);
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		if (!width || !height) throw new Error("Could not decode image");

		const size = session.inputSize;
		const maskCanvas = document.createElement("canvas");
		maskCanvas.width = size;
		maskCanvas.height = size;
		const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
		if (!maskContext) throw new Error("Canvas is not available");
		maskContext.drawImage(image, 0, 0, size, size);

		const input = normalizePixels(maskContext.getImageData(0, 0, size, size).data, size);
		const alpha = await session.run(input);
		const mask = maskContext.createImageData(size, size);
		for (let pixel = 0; pixel < size * size; pixel += 1) {
			mask.data[pixel * 4 + 3] = Math.round(Math.max(0, Math.min(1, alpha[pixel] ?? 0)) * 255);
		}
		maskContext.putImageData(mask, 0, 0);

		const output = document.createElement("canvas");
		output.width = width;
		output.height = height;
		const outputContext = output.getContext("2d");
		if (!outputContext) throw new Error("Canvas is not available");
		outputContext.drawImage(image, 0, 0, width, height);
		outputContext.globalCompositeOperation = "destination-in";
		outputContext.imageSmoothingQuality = "high";
		outputContext.drawImage(maskCanvas, 0, 0, width, height);
		return encodePng(output);
	} finally {
		URL.revokeObjectURL(url);
	}
};

export const preloadBackgroundModel = async (options: PreloadOptions): Promise<void> => {
	await runOnDevice(
		options.device,
		async (device) => {
			await getSegmentationSession(options.model, device, (fraction) => {
				options.onProgress?.(fraction, "Downloading model");
			});
		},
		() => options.onProgress?.(0, "WebGPU unavailable; retrying with CPU"),
	);
};

/**
 * Runs IS-Net through ONNX Runtime Web entirely in the browser.
 * Runtime, weights, and WASM are imported lazily so nothing touches SSR.
 */
export const removeImageBackground = async (file: File | Blob, options: RemoveOptions): Promise<Blob> => {
	const cutout = await runOnDevice(
		options.device,
		async (device) => {
			const session = await getSegmentationSession(options.model, device, (fraction) => {
				options.onProgress?.(Math.min(DOWNLOAD_SHARE, fraction * DOWNLOAD_SHARE), "Downloading model");
			});
			options.onProgress?.(0.6, "Removing background");
			return segmentImage(file, session);
		},
		() => options.onProgress?.(0, "WebGPU unavailable; retrying with CPU"),
	);

	options.onProgress?.(0.94, options.algorithm === "natural" ? "Finalizing cutout" : options.algorithm === "hair" ? "Sharpening fine edges" : "Refining edges");
	const refined = await applyMatteAlgorithm(cutout, options.algorithm);
	options.onProgress?.(1, "Done");
	return refined;
};
