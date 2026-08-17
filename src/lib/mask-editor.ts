import type { CanvasBounds, EditorPoint, EditorStroke, MaskEditorTool } from "@/types/editor";

const clamp = (value: number, minimum: number, maximum: number): number => {
	return Math.max(minimum, Math.min(maximum, value));
};

export const MIN_EDITOR_ZOOM = 10;
export const MAX_EDITOR_ZOOM = 800;

export const clampEditorZoom = (zoom: number): number => {
	return clamp(Math.round(Number.isFinite(zoom) ? zoom : 100), MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM);
};

export const editorZoomFromWheel = (currentZoom: number, deltaY: number, deltaMode = 0): number => {
	if (!Number.isFinite(deltaY) || deltaY === 0) return clampEditorZoom(currentZoom);
	const deltaScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
	return clampEditorZoom(currentZoom * Math.exp(-deltaY * deltaScale * 0.0015));
};

export const fitEditorZoom = (viewportWidth: number, viewportHeight: number, canvasWidth: number, canvasHeight: number, padding = 48): number => {
	if (viewportWidth <= 0 || viewportHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return 100;
	const availableWidth = Math.max(1, viewportWidth - padding);
	const availableHeight = Math.max(1, viewportHeight - padding);
	const canvasAspectRatio = canvasWidth / canvasHeight;
	const fittedWidth = Math.min(availableWidth, availableHeight * canvasAspectRatio);
	return clampEditorZoom((fittedWidth / availableWidth) * 100);
};

export const oppositeEditorTool = (tool: MaskEditorTool): MaskEditorTool => (tool === "restore" ? "erase" : "restore");

export const brushPreviewFromClient = (
	clientX: number,
	clientY: number,
	viewportBounds: CanvasBounds,
	canvasBounds: CanvasBounds,
	viewportScrollLeft: number,
	viewportScrollTop: number,
	canvasWidth: number,
	brushSize: number,
): { diameter: number; left: number; top: number } | null => {
	const insideCanvas =
		clientX >= canvasBounds.left && clientX <= canvasBounds.left + canvasBounds.width && clientY >= canvasBounds.top && clientY <= canvasBounds.top + canvasBounds.height;
	if (!insideCanvas || canvasWidth <= 0 || canvasBounds.width <= 0) return null;

	return {
		diameter: Math.max(4, brushSize * (canvasBounds.width / canvasWidth)),
		left: clientX - viewportBounds.left + viewportScrollLeft,
		top: clientY - viewportBounds.top + viewportScrollTop,
	};
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
