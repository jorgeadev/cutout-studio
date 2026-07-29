import { describe, expect, it, vi } from "vitest";
import { canvasPointFromClient, drawEditorStroke, encodeCanvasPng } from "@/lib/mask-editor";

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

describe("mask brush rendering", () => {
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
