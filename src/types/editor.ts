import type { ImageJob } from "./job";

export type MaskEditorTool = "restore" | "erase";

export interface EditorPoint {
	x: number;
	y: number;
}

export interface EditorStroke {
	tool: MaskEditorTool;
	size: number;
	strength: number;
	points: EditorPoint[];
}

export interface EditorMagicSelection {
	kind: "magic";
	tool: MaskEditorTool;
	point: EditorPoint;
	tolerance: number;
}

export type EditorEdit = EditorStroke | EditorMagicSelection;

export interface EditorHistoryState {
	/** Older applied edits kept for correct redraws after the undo window advances. */
	base: EditorEdit[];
	/** The bounded undo/redo window. */
	entries: EditorEdit[];
	/** Number of entries currently applied; later entries are available to redo. */
	cursor: number;
}

export interface CanvasBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface MaskEditorProps {
	job: ImageJob;
	onClose: () => void;
	onImprove: (id: string) => void;
	onSave: (id: string, blob: Blob) => void;
}
