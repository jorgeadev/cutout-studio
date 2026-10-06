import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadBackgroundModel, removeImageBackground } from "@/lib/remove-background";

const inferenceMocks = vi.hoisted(() => ({
	getSegmentationSession: vi.fn(),
}));

const runtimeCapabilityMocks = vi.hoisted(() => ({
	resolveProcessingDevice: vi.fn(),
}));

vi.mock("@/lib/onnx-runtime", () => inferenceMocks);
vi.mock("@/lib/runtime-capabilities", () => runtimeCapabilityMocks);

const MASK_SIDE = 1024;

const installCanvasEnvironment = (alphaValues: number[]) => {
	class ImageMock {
		onerror: (() => void) | null = null;
		onload: (() => void) | null = null;
		naturalHeight = 1;
		naturalWidth = alphaValues.length;

		set src(_value: string) {
			this.onload?.();
		}
	}

	const pixels = new Uint8ClampedArray(alphaValues.length * 4);
	alphaValues.forEach((alpha, index) => {
		pixels[index * 4 + 3] = alpha;
	});
	const imageData = { data: pixels } as ImageData;
	const context = {
		createImageData: vi.fn(() => imageData),
		drawImage: vi.fn(),
		getImageData: vi.fn(() => imageData),
		globalCompositeOperation: "source-over",
		imageSmoothingQuality: "high",
		putImageData: vi.fn(),
	};
	const encoded = new Blob(["refined"], { type: "image/png" });
	const canvases: Array<{ getContext: ReturnType<typeof vi.fn>; height: number; toBlob: ReturnType<typeof vi.fn>; width: number }> = [];
	const createCanvas = () => {
		const canvas = {
			getContext: vi.fn(() => context),
			height: 0,
			toBlob: vi.fn((callback: BlobCallback) => callback(encoded)),
			width: 0,
		};
		canvases.push(canvas);
		return canvas;
	};
	const createObjectURL = vi.fn(() => "blob:source");
	const revokeObjectURL = vi.fn();

	vi.stubGlobal("Image", ImageMock);
	vi.stubGlobal("document", { createElement: vi.fn(createCanvas) });
	vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

	return { canvases, context, encoded, imageData, revokeObjectURL };
};

const sessionFor = (alphaValues: number[]) => ({
	inputSize: MASK_SIDE,
	run: vi.fn(async () => Float32Array.from(alphaValues, (alpha) => alpha / 255)),
});

beforeEach(() => {
	inferenceMocks.getSegmentationSession.mockReset();
	runtimeCapabilityMocks.resolveProcessingDevice.mockReset();
	runtimeCapabilityMocks.resolveProcessingDevice.mockImplementation(async (device: string) => (device === "auto" ? "gpu" : device));
	vi.unstubAllGlobals();
});

describe("model runtime configuration", () => {
	it("runs the selected model on WebGPU and reports staged progress", async () => {
		const { encoded } = installCanvasEnvironment([0]);
		const progress = vi.fn();
		inferenceMocks.getSegmentationSession.mockImplementation(async (...args: unknown[]) => {
			const onProgress = args[2] as ((fraction: number) => void) | undefined;
			onProgress?.(0.75);
			return sessionFor([0]);
		});

		await expect(
			removeImageBackground(new Blob(["source"]), {
				algorithm: "natural",
				device: "auto",
				model: "isnet_fp16",
				onProgress: progress,
			}),
		).resolves.toBe(encoded);

		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledWith("isnet_fp16", "gpu", expect.any(Function));
		expect(progress).toHaveBeenCalledWith(0.375, "Downloading model");
		expect(progress).toHaveBeenCalledWith(0.6, "Removing background");
		expect(progress).toHaveBeenCalledWith(0.94, "Finalizing cutout");
		expect(progress).toHaveBeenLastCalledWith(1, "Done");
	});

	it("preloads the selected model on the explicit device", async () => {
		const progress = vi.fn();
		inferenceMocks.getSegmentationSession.mockImplementation(async (...args: unknown[]) => {
			const onProgress = args[2] as ((fraction: number) => void) | undefined;
			onProgress?.(0.5);
			return sessionFor([0]);
		});

		await preloadBackgroundModel({ device: "cpu", model: "isnet_quint8", onProgress: progress });

		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledWith("isnet_quint8", "cpu", expect.any(Function));
		expect(progress).toHaveBeenCalledWith(0.5, "Downloading model");
	});

	it("uses CPU directly when automatic capability detection finds no GPU adapter", async () => {
		const { encoded } = installCanvasEnvironment([0]);
		runtimeCapabilityMocks.resolveProcessingDevice.mockResolvedValueOnce("cpu");
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([0]));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "natural", device: "auto", model: "isnet_fp16" })).resolves.toBe(encoded);
		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledWith("isnet_fp16", "cpu", expect.any(Function));
	});

	it("retries automatic model preloading on CPU when WebGPU cannot initialize", async () => {
		const progress = vi.fn();
		inferenceMocks.getSegmentationSession.mockRejectedValueOnce(new Error("no available backend found. ERR: [webgpu] webgpuInit is not a function")).mockResolvedValueOnce(sessionFor([0]));

		await expect(preloadBackgroundModel({ device: "auto", model: "isnet_quint8", onProgress: progress })).resolves.toBeUndefined();

		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledTimes(2);
		expect(inferenceMocks.getSegmentationSession.mock.calls[0]?.[1]).toBe("gpu");
		expect(inferenceMocks.getSegmentationSession.mock.calls[1]?.[1]).toBe("cpu");
		expect(progress).toHaveBeenCalledWith(0, "WebGPU unavailable; retrying with CPU");
	});

	it("retries automatic removal on CPU when WebGPU cannot initialize", async () => {
		const { encoded } = installCanvasEnvironment([0]);
		const progress = vi.fn();
		inferenceMocks.getSegmentationSession.mockRejectedValueOnce(new Error("no available backend found. ERR: [webgpu] webgpuInit is not a function")).mockResolvedValueOnce(sessionFor([0]));

		await expect(
			removeImageBackground(new Blob(["source"]), {
				algorithm: "natural",
				device: "auto",
				model: "isnet_fp16",
				onProgress: progress,
			}),
		).resolves.toBe(encoded);

		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledTimes(2);
		expect(inferenceMocks.getSegmentationSession.mock.calls[0]?.[1]).toBe("gpu");
		expect(inferenceMocks.getSegmentationSession.mock.calls[1]?.[1]).toBe("cpu");
		expect(progress).toHaveBeenCalledWith(0, "WebGPU unavailable; retrying with CPU");
	});

	it("does not override an explicitly selected WebGPU device", async () => {
		const backendError = new Error("[webgpu] adapter initialization failed");
		inferenceMocks.getSegmentationSession.mockRejectedValue(backendError);

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "natural", device: "gpu", model: "isnet" })).rejects.toBe(backendError);
		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledTimes(1);
	});

	it("does not mask unrelated errors while using automatic device selection", async () => {
		const downloadError = new Error("The downloaded background model failed its integrity check");
		inferenceMocks.getSegmentationSession.mockRejectedValue(downloadError);

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "natural", device: "auto", model: "isnet" })).rejects.toBe(downloadError);
		expect(inferenceMocks.getSegmentationSession).toHaveBeenCalledTimes(1);
	});
});

describe("matte refinement", () => {
	it("creates a hard binary alpha edge", async () => {
		const { imageData, revokeObjectURL } = installCanvasEnvironment([127, 128]);
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([127, 128]));

		await removeImageBackground(new Blob(["source"]), { algorithm: "hard", device: "cpu", model: "isnet_quint8" });

		expect([imageData.data[3], imageData.data[7]]).toEqual([0, 255]);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:source");
	});

	it("tightens semi-transparent edges while preserving endpoints", async () => {
		const { imageData } = installCanvasEnvironment([0, 128, 255]);
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([0, 128, 255]));

		await removeImageBackground(new Blob(["source"]), { algorithm: "refine", device: "cpu", model: "isnet_fp16" });

		expect(imageData.data[3]).toBe(0);
		expect(imageData.data[11]).toBe(255);
		expect(imageData.data[7]).toBeGreaterThan(100);
		expect(imageData.data[7]).toBeLessThan(155);
	});

	it("softens neighboring alpha values", async () => {
		const { encoded, imageData } = installCanvasEnvironment([0, 255, 0]);
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([0, 255, 0]));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "soft", device: "cpu", model: "isnet" })).resolves.toBe(encoded);
		expect([imageData.data[3], imageData.data[7], imageData.data[11]]).toEqual([38, 179, 38]);
	});

	it("sharpens isolated semi-transparent hair detail without destroying transparent pixels", async () => {
		const { imageData } = installCanvasEnvironment([0, 0, 80, 0, 255]);
		const progress = vi.fn();
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([0, 0, 80, 0, 255]));

		await removeImageBackground(new Blob(["source"]), { algorithm: "hair", device: "cpu", model: "isnet", onProgress: progress });

		expect(imageData.data[3]).toBe(0);
		expect(imageData.data[11]).toBeGreaterThan(80);
		expect(imageData.data[15]).toBe(0);
		expect(imageData.data[19]).toBe(255);
		expect(progress).toHaveBeenCalledWith(0.94, "Sharpening fine edges");
	});

	it("revokes temporary URLs when a canvas is unavailable", async () => {
		const { revokeObjectURL } = installCanvasEnvironment([255]);
		vi.stubGlobal("document", { createElement: vi.fn(() => ({ getContext: () => null })) });
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor([255]));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "refine", device: "cpu", model: "isnet" })).rejects.toThrow("Canvas is not available");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:source");
	});

	it("refines oversized cutouts at a capped resolution instead of crashing the tab", async () => {
		const { canvases, context, encoded } = installCanvasEnvironment(Array.from({ length: 5000 }, () => 0));
		inferenceMocks.getSegmentationSession.mockResolvedValue(sessionFor(Array.from({ length: 5000 }, () => 0)));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "hard", device: "cpu", model: "isnet_quint8" })).resolves.toBe(encoded);

		expect(canvases[0]?.width).toBe(MASK_SIDE);
		expect(canvases[2]?.width).toBe(4096);
		expect(canvases[2]?.height).toBe(1);
		expect(canvases[3]?.width).toBe(5000);
		expect(context.drawImage).toHaveBeenLastCalledWith(canvases[2], 0, 0, 5000, 1);
	});
});
