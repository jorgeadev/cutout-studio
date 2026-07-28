import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadBackgroundModel, removeImageBackground } from "@/lib/remove-background";

const backgroundRemovalMocks = vi.hoisted(() => ({
	preload: vi.fn(),
	removeBackground: vi.fn(),
}));

vi.mock("@imgly/background-removal", () => backgroundRemovalMocks);

const installRefinementEnvironment = (alphaValues: number[]) => {
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
		drawImage: vi.fn(),
		getImageData: vi.fn(() => imageData),
		putImageData: vi.fn(),
	};
	const encoded = new Blob(["refined"], { type: "image/png" });
	const canvas = {
		getContext: vi.fn(() => context),
		height: 0,
		toBlob: vi.fn((callback: BlobCallback) => callback(encoded)),
		width: 0,
	};
	const createObjectURL = vi.fn(() => "blob:temporary-cutout");
	const revokeObjectURL = vi.fn();

	vi.stubGlobal("Image", ImageMock);
	vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
	vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

	return { context, encoded, imageData, revokeObjectURL };
};

beforeEach(() => {
	backgroundRemovalMocks.preload.mockReset();
	backgroundRemovalMocks.removeBackground.mockReset();
	vi.unstubAllGlobals();
});

describe("model runtime configuration", () => {
	it("maps auto to WebGPU and caps model progress before refinement", async () => {
		const cutout = new Blob(["cutout"], { type: "image/png" });
		const progress = vi.fn();
		backgroundRemovalMocks.removeBackground.mockImplementation(async (...args: unknown[]) => {
			const config = args[1] as { progress: (key: string, current: number, total: number) => void };
			config.progress("fetch:model", 1, 2);
			config.progress("compute:mask", 4, 4);
			return cutout;
		});

		await expect(
			removeImageBackground(new Blob(["source"]), {
				algorithm: "natural",
				device: "auto",
				model: "isnet_fp16",
				onProgress: progress,
			}),
		).resolves.toBe(cutout);

		const config = backgroundRemovalMocks.removeBackground.mock.calls[0]?.[1];
		expect(config).toMatchObject({ device: "gpu", model: "isnet_fp16", output: { format: "image/png" } });
		expect(progress).toHaveBeenCalledWith(0.45, "Downloading model");
		expect(progress).toHaveBeenCalledWith(0.9, "Removing background");
		expect(progress).toHaveBeenCalledWith(0.94, "Finalizing cutout");
		expect(progress).toHaveBeenLastCalledWith(1, "Done");
	});

	it("preloads the selected model on the explicit device", async () => {
		const progress = vi.fn();
		backgroundRemovalMocks.preload.mockImplementation(async (...args: unknown[]) => {
			const config = args[0] as { progress: (key: string, current: number, total: number) => void };
			config.progress("fetch:model", 3, 4);
		});

		await preloadBackgroundModel({ device: "cpu", model: "isnet_quint8", onProgress: progress });

		expect(backgroundRemovalMocks.preload).toHaveBeenCalledWith(expect.objectContaining({ device: "cpu", model: "isnet_quint8", output: { format: "image/png" } }));
		expect(progress).toHaveBeenCalledWith(0.75, "Downloading model");
	});

	it("handles progress events without totals", async () => {
		const progress = vi.fn();
		backgroundRemovalMocks.preload.mockImplementation(async (...args: unknown[]) => {
			const config = args[0] as { progress: (key: string, current: number, total: number) => void };
			config.progress("other", 0, 0);
		});
		await expect(preloadBackgroundModel({ device: "gpu", model: "isnet", onProgress: progress })).resolves.toBeUndefined();
		expect(progress).toHaveBeenCalledWith(0, "Working");
	});
});

describe("matte refinement", () => {
	it("creates a hard binary alpha edge", async () => {
		const { imageData, revokeObjectURL } = installRefinementEnvironment([127, 128]);
		backgroundRemovalMocks.removeBackground.mockResolvedValue(new Blob(["cutout"]));

		await removeImageBackground(new Blob(["source"]), { algorithm: "hard", device: "cpu", model: "isnet_quint8" });

		expect([imageData.data[3], imageData.data[7]]).toEqual([0, 255]);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:temporary-cutout");
	});

	it("tightens semi-transparent edges while preserving endpoints", async () => {
		const { imageData } = installRefinementEnvironment([0, 128, 255]);
		backgroundRemovalMocks.removeBackground.mockResolvedValue(new Blob(["cutout"]));

		await removeImageBackground(new Blob(["source"]), { algorithm: "refine", device: "cpu", model: "isnet_fp16" });

		expect(imageData.data[3]).toBe(0);
		expect(imageData.data[11]).toBe(255);
		expect(imageData.data[7]).toBeGreaterThan(100);
		expect(imageData.data[7]).toBeLessThan(155);
	});

	it("softens neighboring alpha values", async () => {
		const { encoded, imageData } = installRefinementEnvironment([0, 255, 0]);
		backgroundRemovalMocks.removeBackground.mockResolvedValue(new Blob(["cutout"]));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "soft", device: "cpu", model: "isnet" })).resolves.toBe(encoded);
		expect([imageData.data[3], imageData.data[7], imageData.data[11]]).toEqual([38, 179, 38]);
	});

	it("revokes temporary URLs when a canvas is unavailable", async () => {
		const { revokeObjectURL } = installRefinementEnvironment([255]);
		vi.stubGlobal("document", { createElement: vi.fn(() => ({ getContext: () => null })) });
		backgroundRemovalMocks.removeBackground.mockResolvedValue(new Blob(["cutout"]));

		await expect(removeImageBackground(new Blob(["source"]), { algorithm: "refine", device: "cpu", model: "isnet" })).rejects.toThrow("Canvas is not available");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:temporary-cutout");
	});
});
