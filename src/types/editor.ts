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
