import type { CanvasBounds, EditorPoint, EditorStroke } from "@/types/editor";

const clamp = (value: number, minimum: number, maximum: number): number => {
	return Math.max(minimum, Math.min(maximum, value));
};

export const canvasPointFromClient = (clientX: number, clientY: number, bounds: CanvasBounds, canvasWidth: number, canvasHeight: number): EditorPoint => {
	const normalizedX = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0;
	const normalizedY = bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0;
	return {
		x: clamp(normalizedX * canvasWidth, 0, canvasWidth),
		y: clamp(normalizedY * canvasHeight, 0, canvasHeight),
	};
};

export const drawEditorStroke = (context: CanvasRenderingContext2D, stroke: EditorStroke, originalImage: CanvasImageSource): void => {
	const firstPoint = stroke.points[0];
	if (!firstPoint) return;

	context.save();
	context.globalAlpha = clamp(stroke.strength, 0, 1);
	context.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
	context.lineCap = "round";
	context.lineJoin = "round";
	context.lineWidth = Math.max(1, stroke.size);
	context.strokeStyle = stroke.tool === "erase" ? "#000000" : (context.createPattern(originalImage, "no-repeat") ?? "#ffffff");
	context.beginPath();
	context.moveTo(firstPoint.x, firstPoint.y);
	if (stroke.points.length === 1) {
		context.lineTo(firstPoint.x + 0.01, firstPoint.y);
	} else {
		for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
	}
	context.stroke();
	context.restore();
};

export const encodeCanvasPng = (canvas: HTMLCanvasElement): Promise<Blob> => {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the edited cutout"))), "image/png");
	});
};
