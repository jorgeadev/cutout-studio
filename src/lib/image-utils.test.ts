import { afterEach, describe, expect, it, vi } from "vitest";
import {
	backgroundToCss,
	extensionFor,
	formatBytes,
	isValidHex,
	loadImage,
	normalizeHex,
	outputFileName,
	readableTextColor,
	renderJob,
	triggerDownload,
} from "@/lib/image-utils";
import type { BackgroundConfig } from "@/types/background";
import type { ExportConfig } from "@/types/export";
import type { ImageJob } from "@/types/job";

const installImageMock = (shouldFail = false, naturalWidth = 120, naturalHeight = 80) => {
	class ImageMock {
		crossOrigin: string | null = null;
		onerror: (() => void) | null = null;
		onload: (() => void) | null = null;
		naturalHeight = naturalHeight;
		naturalWidth = naturalWidth;

		set src(_value: string) {
			if (shouldFail) this.onerror?.();
			else this.onload?.();
		}
	}

	vi.stubGlobal("Image", ImageMock);
};

const createCanvasHarness = (encodedBlob = new Blob(["encoded"], { type: "image/png" })) => {
	const addColorStop = vi.fn();
	const context = {
		createLinearGradient: vi.fn(() => ({ addColorStop })),
		drawImage: vi.fn(),
		fillRect: vi.fn(),
		fillStyle: "",
		imageSmoothingQuality: "low",
	};
	const canvas = {
		getContext: vi.fn(() => context),
		height: 0,
		toBlob: vi.fn((callback: BlobCallback, _format?: string, _quality?: number) => callback(encodedBlob)),
		width: 0,
	};
	const createElement = vi.fn((tagName: string) => {
		if (tagName === "canvas") return canvas;
		throw new Error(`Unexpected element: ${tagName}`);
	});
	vi.stubGlobal("document", { createElement });

	return { addColorStop, canvas, context };
};

const createJob = (): ImageJob =>
	({
		cutoutUrl: "blob:cutout",
	} as ImageJob);

const createExport = (overrides: Partial<ExportConfig> = {}): ExportConfig => ({
	format: "image/png",
	quality: 0.9,
	scale: 1,
	...overrides,
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("image value helpers", () => {
	it("converts backgrounds to CSS", () => {
		expect(backgroundToCss({ kind: "transparent", color: "#000", color2: "#fff", angle: 0 })).toBeNull();
		expect(backgroundToCss({ kind: "solid", color: "#123456", color2: "#fff", angle: 0 })).toBe("#123456");
		expect(backgroundToCss({ kind: "gradient", color: "#123456", color2: "#abcdef", angle: 45 })).toBe("linear-gradient(45deg, #123456, #abcdef)");
	});

	it("validates, normalizes, and contrasts hexadecimal colors", () => {
		expect(isValidHex(" #AbC ")).toBe(true);
		expect(isValidHex("#abcd")).toBe(false);
		expect(normalizeHex("ABC")).toBe("#aabbcc");
		expect(normalizeHex(" 123456 ")).toBe("#123456");
		expect(readableTextColor("#ffffff")).toBe("#000000");
		expect(readableTextColor("#000000")).toBe("#ffffff");
		expect(readableTextColor("not-a-color")).toBe("#000000");
	});

	it("formats byte counts and safe output names", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
		expect(extensionFor("image/jpeg")).toBe("jpg");
		expect(extensionFor("image/webp")).toBe("webp");
		expect(extensionFor("image/png")).toBe("png");
		expect(outputFileName("portrait.final.jpg", "image/webp")).toBe("portrait.final-nobg.webp");
		expect(outputFileName(".png", "image/png")).toBe("image-nobg.png");
	});
});

describe("image loading and rendering", () => {
	it("loads decodable images and rejects invalid image data", async () => {
		installImageMock();
		await expect(loadImage("blob:valid")).resolves.toMatchObject({ crossOrigin: "anonymous" });

		installImageMock(true);
		await expect(loadImage("blob:invalid")).rejects.toThrow("Could not decode image");
	});

	it("rejects rendering before a cutout exists", async () => {
		await expect(renderJob({} as ImageJob, { kind: "transparent", color: "#000", color2: "#fff", angle: 0 }, createExport())).rejects.toThrow(
			"Image has not been processed yet",
		);
	});

	it("scales and composites a solid background", async () => {
		installImageMock(false, 120, 80);
		const { canvas, context } = createCanvasHarness();
		const background: BackgroundConfig = { kind: "solid", color: "#ff0000", color2: "#000000", angle: 0 };

		await expect(renderJob(createJob(), background, createExport({ scale: 0.5 }))).resolves.toBeInstanceOf(Blob);
		expect(canvas.width).toBe(60);
		expect(canvas.height).toBe(40);
		expect(context.fillStyle).toBe("#ff0000");
		expect(context.fillRect).toHaveBeenCalledWith(0, 0, 60, 40);
		expect(context.drawImage).toHaveBeenCalledOnce();
	});

	it("paints gradients and preserves both color stops", async () => {
		installImageMock();
		const { addColorStop, context } = createCanvasHarness();
		const background: BackgroundConfig = { kind: "gradient", color: "#112233", color2: "#abcdef", angle: 90 };

		await renderJob(createJob(), background, createExport());
		expect(context.createLinearGradient).toHaveBeenCalledOnce();
		expect(addColorStop).toHaveBeenNthCalledWith(1, 0, "#112233");
		expect(addColorStop).toHaveBeenNthCalledWith(2, 1, "#abcdef");
	});

	it("uses white behind transparent cutouts for opaque exports", async () => {
		installImageMock();
		const { canvas, context } = createCanvasHarness();
		const background: BackgroundConfig = { kind: "transparent", color: "#000000", color2: "#ffffff", angle: 0 };

		await renderJob(createJob(), background, createExport({ format: "image/jpeg", quality: 0.72 }));
		expect(context.fillStyle).toBe("#ffffff");
		expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.72);
	});

	it("reports unavailable canvases and failed encodes", async () => {
		installImageMock();
		vi.stubGlobal("document", { createElement: vi.fn(() => ({ getContext: () => null })) });
		await expect(renderJob(createJob(), { kind: "transparent", color: "#000", color2: "#fff", angle: 0 }, createExport())).rejects.toThrow("Canvas is not available");

		const { canvas } = createCanvasHarness();
		canvas.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
		await expect(renderJob(createJob(), { kind: "transparent", color: "#000", color2: "#fff", angle: 0 }, createExport())).rejects.toThrow("Encoding failed");
	});
});

describe("downloads", () => {
	it("clicks a temporary link and revokes the object URL", () => {
		vi.useFakeTimers();
		const anchor = { click: vi.fn(), download: "", href: "", remove: vi.fn() };
		const appendChild = vi.fn();
		const createObjectURL = vi.fn(() => "blob:download");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("document", { body: { appendChild }, createElement: vi.fn(() => anchor) });
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

		triggerDownload(new Blob(["image"]), "cutout.png");
		expect(anchor.href).toBe("blob:download");
		expect(anchor.download).toBe("cutout.png");
		expect(appendChild).toHaveBeenCalledWith(anchor);
		expect(anchor.click).toHaveBeenCalledOnce();
		expect(anchor.remove).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(2000);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
	});
});
