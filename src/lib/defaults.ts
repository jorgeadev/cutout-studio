import type { BackgroundConfig } from "@/types/background";
import type { ExportConfig } from "@/types/export";
import type { ProcessingConfig } from "@/types/processing";

export const DEFAULT_BACKGROUND: BackgroundConfig = {
	kind: "transparent",
	color: "#0f766e",
	color2: "#0ea5e9",
	angle: 160,
};

export const DEFAULT_EXPORT: ExportConfig = {
	format: "image/png",
	scale: 1,
	quality: 0.92,
};

export const DEFAULT_PROCESSING: ProcessingConfig = {
	model: "isnet_fp16",
	algorithm: "refine",
	device: "auto",
};
