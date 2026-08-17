import { describe, expect, it, vi } from "vitest";
import {
	applyMagicSelection,
	brushPreviewFromClient,
	canvasPointFromClient,
	clampEditorZoom,
	drawEditorStroke,
	editorZoomFromWheel,
	encodeCanvasPng,
	fitEditorZoom,
	imageMatchesCanvasAspectRatio,
	MAX_EDITOR_ZOOM,
	MIN_EDITOR_ZOOM,
	oppositeEditorTool,
	panScrollFromDrag,
} from "@/lib/mask-editor";

const imageDataFrom = (pixels: number[], width: number): ImageData =>
	({ data: new Uint8ClampedArray(pixels), width, height: pixels.length / 4 / width, colorSpace: "srgb" }) as ImageData;

const createPixelContext = (pixels: ImageData) => ({
	getImageData: vi.fn(() => pixels),
	putImageData: vi.fn(),
});

const createContext = () => {
	const pattern = {} as CanvasPattern;
	const context = {
		beginPath: vi.fn(),
		createPattern: vi.fn(() => pattern),
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		lineCap: "butt",
		lineJoin: "miter",
		lineTo: vi.fn(),
		lineWidth: 1,
		moveTo: vi.fn(),
		restore: vi.fn(),
		save: vi.fn(),
		stroke: vi.fn(),
		strokeStyle: "",
	};
	return { context, pattern };
};

describe("mask editor coordinates", () => {
	it("maps displayed pointer coordinates to full-resolution canvas pixels", () => {
		expect(canvasPointFromClient(60, 45, { left: 10, top: 20, width: 100, height: 50 }, 1000, 500)).toEqual({ x: 500, y: 250 });
	});

	it("clamps points to the canvas and handles collapsed bounds", () => {
		expect(canvasPointFromClient(-20, 200, { left: 10, top: 20, width: 100, height: 50 }, 1000, 500)).toEqual({ x: 0, y: 500 });
		expect(canvasPointFromClient(50, 50, { left: 0, top: 0, width: 0, height: 0 }, 1000, 500)).toEqual({ x: 0, y: 0 });
	});
});

describe("mask editor zoom", () => {
	it("zooms smoothly in the expected wheel direction", () => {
		expect(editorZoomFromWheel(100, -100)).toBe(116);
		expect(editorZoomFromWheel(100, 100)).toBe(86);
		expect(editorZoomFromWheel(100, -1, 1)).toBe(102);
	});

	it("keeps wheel and direct zoom values within the editor limits", () => {
		expect(MAX_EDITOR_ZOOM).toBe(3200);
		expect(editorZoomFromWheel(MAX_EDITOR_ZOOM, -10_000)).toBe(MAX_EDITOR_ZOOM);
		expect(editorZoomFromWheel(MIN_EDITOR_ZOOM, 10_000)).toBe(MIN_EDITOR_ZOOM);
		expect(clampEditorZoom(Number.NaN)).toBe(100);
		expect(clampEditorZoom(250.6)).toBe(251);
	});

	it("fits wide and tall canvases inside the available viewport", () => {
		expect(fitEditorZoom(1200, 800, 1600, 900)).toBe(100);
		expect(fitEditorZoom(1200, 800, 800, 1000)).toBe(52);
		expect(fitEditorZoom(0, 800, 800, 1000)).toBe(100);
	});
});

describe("edited image loading", () => {
	it("accepts proportional exports at different resolutions", () => {
		expect(imageMatchesCanvasAspectRatio(4096, 3072, 1024, 768)).toBe(true);
		expect(imageMatchesCanvasAspectRatio(1000, 1000, 1024, 768)).toBe(false);
		expect(imageMatchesCanvasAspectRatio(0, 1000, 1024, 768)).toBe(false);
	});
});

describe("mask editor panning", () => {
	it("translates pointer dragging into scroll offsets", () => {
		expect(panScrollFromDrag(240, 120, 100, 100, 60, 40)).toEqual({ left: 280, top: 180 });
		expect(panScrollFromDrag(20, 10, 100, 100, 160, 180)).toEqual({ left: 0, top: 0 });
	});
});

describe("mask brush preview", () => {
	it("matches the rendered brush diameter and accounts for viewport scrolling", () => {
		expect(brushPreviewFromClient(340, 230, { left: 100, top: 50, width: 800, height: 600 }, { left: 140, top: 80, width: 400, height: 300 }, 200, 100, 1000, 64)).toEqual({
			diameter: 25.6,
			left: 440,
			top: 280,
		});
	});

	it("hides the brush outside the canvas or when the canvas is collapsed", () => {
		const viewport = { left: 0, top: 0, width: 500, height: 500 };
		expect(brushPreviewFromClient(10, 10, viewport, { left: 20, top: 20, width: 400, height: 400 }, 0, 0, 1000, 64)).toBeNull();
		expect(brushPreviewFromClient(20, 20, viewport, { left: 20, top: 20, width: 0, height: 0 }, 0, 0, 1000, 64)).toBeNull();
	});
});

describe("mask brush rendering", () => {
	it("switches to the opposite brush action", () => {
		expect(oppositeEditorTool("restore")).toBe("erase");
		expect(oppositeEditorTool("erase")).toBe("restore");
	});

	it("erases a single-point stroke with a round brush", () => {
		const { context } = createContext();
		drawEditorStroke(context as unknown as CanvasRenderingContext2D, { tool: "erase", size: 24, strength: 0.75, points: [{ x: 4, y: 8 }] }, {} as CanvasImageSource);

		expect(context.globalCompositeOperation).toBe("destination-out");
		expect(context.globalAlpha).toBe(0.75);
		expect(context.lineCap).toBe("round");
		expect(context.lineWidth).toBe(24);
		expect(context.moveTo).toHaveBeenCalledWith(4, 8);
		expect(context.lineTo).toHaveBeenCalledWith(4.01, 8);
		expect(context.stroke).toHaveBeenCalledOnce();
		expect(context.restore).toHaveBeenCalledOnce();
	});

	it("restores original pixels along a multi-point stroke", () => {
		const { context, pattern } = createContext();
		const originalImage = {} as CanvasImageSource;
		drawEditorStroke(
			context as unknown as CanvasRenderingContext2D,
			{
				tool: "restore",
				size: 0,
				strength: 2,
				points: [
					{ x: 1, y: 2 },
					{ x: 3, y: 4 },
					{ x: 5, y: 6 },
				],
			},
			originalImage,
		);

		expect(context.createPattern).toHaveBeenCalledWith(originalImage, "no-repeat");
		expect(context.strokeStyle).toBe(pattern);
		expect(context.globalCompositeOperation).toBe("source-over");
		expect(context.globalAlpha).toBe(1);
		expect(context.lineWidth).toBe(1);
		expect(context.lineTo.mock.calls).toEqual([
			[3, 4],
			[5, 6],
		]);
	});

	it("ignores an empty stroke", () => {
		const { context } = createContext();
		drawEditorStroke(context as unknown as CanvasRenderingContext2D, { tool: "erase", size: 20, strength: 1, points: [] }, {} as CanvasImageSource);
		expect(context.save).not.toHaveBeenCalled();
	});
});

describe("mask magic selection", () => {
	it("makes only the connected matching region transparent", () => {
		const currentPixels = imageDataFrom([200, 10, 10, 255, 200, 10, 10, 255, 10, 10, 200, 255, 200, 10, 10, 255], 4);
		const originalPixels = imageDataFrom([...currentPixels.data], 4);
		const context = createPixelContext(currentPixels);

		expect(applyMagicSelection(context as unknown as CanvasRenderingContext2D, { kind: "magic", tool: "erase", point: { x: 0, y: 0 }, tolerance: 0 }, originalPixels)).toBe(2);
		expect([currentPixels.data[3], currentPixels.data[7], currentPixels.data[11], currentPixels.data[15]]).toEqual([0, 0, 255, 255]);
		expect(context.putImageData).toHaveBeenCalledOnce();
	});

	it("restores a connected region using colors from the original image", () => {
		const originalPixels = imageDataFrom([200, 10, 10, 255, 200, 10, 10, 255, 10, 10, 200, 255, 200, 10, 10, 255], 4);
		const currentPixels = imageDataFrom(new Array(16).fill(0), 4);
		const context = createPixelContext(currentPixels);

		expect(applyMagicSelection(context as unknown as CanvasRenderingContext2D, { kind: "magic", tool: "restore", point: { x: 0, y: 0 }, tolerance: 0 }, originalPixels)).toBe(2);
		expect([currentPixels.data[3], currentPixels.data[7], currentPixels.data[11], currentPixels.data[15]]).toEqual([255, 255, 0, 0]);
	});

	it("uses tolerance to include nearby colors", () => {
		const currentPixels = imageDataFrom([100, 100, 100, 255, 120, 100, 100, 255, 180, 100, 100, 255], 3);
		const originalPixels = imageDataFrom([...currentPixels.data], 3);
		const context = createPixelContext(currentPixels);

		expect(applyMagicSelection(context as unknown as CanvasRenderingContext2D, { kind: "magic", tool: "erase", point: { x: 0, y: 0 }, tolerance: 5 }, originalPixels)).toBe(2);
		expect([currentPixels.data[3], currentPixels.data[7], currentPixels.data[11]]).toEqual([0, 0, 255]);
	});
});

describe("mask editor export", () => {
	it("encodes the edited canvas as PNG", async () => {
		const png = new Blob(["edited"], { type: "image/png" });
		const canvas = { toBlob: vi.fn((callback: BlobCallback, format: string) => callback(format === "image/png" ? png : null)) } as unknown as HTMLCanvasElement;
		await expect(encodeCanvasPng(canvas)).resolves.toBe(png);
	});

	it("reports a failed browser encode", async () => {
		const canvas = { toBlob: vi.fn((callback: BlobCallback) => callback(null)) } as unknown as HTMLCanvasElement;
		await expect(encodeCanvasPng(canvas)).rejects.toThrow("Could not save the edited cutout");
	});
});
