import type { CanvasBounds, EditorEdit, EditorHistoryState, EditorMagicSelection, EditorPoint, EditorStroke, MaskEditorTool } from "@/types/editor";

const clamp = (value: number, minimum: number, maximum: number): number => {
	return Math.max(minimum, Math.min(maximum, value));
};

export const MIN_EDITOR_ZOOM = 10;
export const MAX_EDITOR_ZOOM = 3200;
export const MAX_EDITOR_HISTORY = 100;

export const createEditorHistory = (): EditorHistoryState => ({ base: [], entries: [], cursor: 0 });

export const activeEditorEdits = (history: EditorHistoryState): EditorEdit[] => [...history.base, ...history.entries.slice(0, history.cursor)];

export const appendEditorHistory = (history: EditorHistoryState, edit: EditorEdit, limit = MAX_EDITOR_HISTORY): EditorHistoryState => {
	const boundedLimit = Math.max(1, Math.floor(limit));
	let entries = [...history.entries.slice(0, history.cursor), edit];
	let base = history.base;
	if (entries.length > boundedLimit) {
		const overflow = entries.length - boundedLimit;
		base = [...base, ...entries.slice(0, overflow)];
		entries = entries.slice(overflow);
	}
	return { base, entries, cursor: entries.length };
};

export const undoEditorHistory = (history: EditorHistoryState): EditorHistoryState => (history.cursor > 0 ? { ...history, cursor: history.cursor - 1 } : history);

export const redoEditorHistory = (history: EditorHistoryState): EditorHistoryState =>
	history.cursor < history.entries.length ? { ...history, cursor: history.cursor + 1 } : history;

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

export const imageMatchesCanvasAspectRatio = (imageWidth: number, imageHeight: number, canvasWidth: number, canvasHeight: number, tolerance = 0.01): boolean => {
	if (imageWidth <= 0 || imageHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return false;
	const imageRatio = imageWidth / imageHeight;
	const canvasRatio = canvasWidth / canvasHeight;
	return Math.abs(imageRatio - canvasRatio) / canvasRatio <= Math.max(0, tolerance);
};

export const panScrollFromDrag = (
	startScrollLeft: number,
	startScrollTop: number,
	startClientX: number,
	startClientY: number,
	clientX: number,
	clientY: number,
): { left: number; top: number } => ({
	left: Math.max(0, startScrollLeft - (clientX - startClientX)),
	top: Math.max(0, startScrollTop - (clientY - startClientY)),
});

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

export const applyMagicSelection = (context: CanvasRenderingContext2D, selection: EditorMagicSelection, originalPixels: ImageData): number => {
	const { width, height } = originalPixels;
	if (width <= 0 || height <= 0 || originalPixels.data.length < width * height * 4) return 0;

	const output = context.getImageData(0, 0, width, height);
	const outputPixels = output.data;
	const matchingPixels = selection.tool === "restore" ? originalPixels.data : outputPixels;
	const seedX = clamp(Math.floor(selection.point.x), 0, width - 1);
	const seedY = clamp(Math.floor(selection.point.y), 0, height - 1);
	const seedOffset = (seedY * width + seedX) * 4;
	const seedRed = matchingPixels[seedOffset];
	const seedGreen = matchingPixels[seedOffset + 1];
	const seedBlue = matchingPixels[seedOffset + 2];
	const maximumColorDistance = (clamp(selection.tolerance, 0, 100) / 100) * Math.sqrt(3 * 255 ** 2);
	const maximumColorDistanceSquared = maximumColorDistance ** 2;

	const matches = (x: number, y: number): boolean => {
		const offset = (y * width + x) * 4;
		const outputAlpha = outputPixels[offset + 3];
		const editable = selection.tool === "erase" ? outputAlpha > 0 : outputAlpha < originalPixels.data[offset + 3];
		if (!editable) return false;
		const redDifference = matchingPixels[offset] - seedRed;
		const greenDifference = matchingPixels[offset + 1] - seedGreen;
		const blueDifference = matchingPixels[offset + 2] - seedBlue;
		return redDifference ** 2 + greenDifference ** 2 + blueDifference ** 2 <= maximumColorDistanceSquared;
	};

	if (!matches(seedX, seedY)) return 0;

	const pendingSegments = [seedY * width + seedX];
	let changedPixels = 0;
	while (pendingSegments.length) {
		const seedIndex = pendingSegments.pop();
		if (seedIndex === undefined) break;
		const y = Math.floor(seedIndex / width);
		let x = seedIndex % width;
		if (!matches(x, y)) continue;
		while (x > 0 && matches(x - 1, y)) x -= 1;

		let hasSegmentAbove = false;
		let hasSegmentBelow = false;
		for (; x < width && matches(x, y); x += 1) {
			const offset = (y * width + x) * 4;
			if (selection.tool === "erase") {
				outputPixels[offset + 3] = 0;
			} else {
				outputPixels.set(originalPixels.data.subarray(offset, offset + 4), offset);
			}
			changedPixels += 1;

			if (y > 0) {
				const matchesAbove = matches(x, y - 1);
				if (matchesAbove && !hasSegmentAbove) pendingSegments.push((y - 1) * width + x);
				hasSegmentAbove = matchesAbove;
			}
			if (y + 1 < height) {
				const matchesBelow = matches(x, y + 1);
				if (matchesBelow && !hasSegmentBelow) pendingSegments.push((y + 1) * width + x);
				hasSegmentBelow = matchesBelow;
			}
		}
	}

	if (changedPixels) context.putImageData(output, 0, 0);
	return changedPixels;
};

export const encodeCanvasPng = (canvas: HTMLCanvasElement): Promise<Blob> => {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the edited cutout"))), "image/png");
	});
};
