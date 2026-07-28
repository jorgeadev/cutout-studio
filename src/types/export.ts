export type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

export interface ExportConfig {
	format: OutputFormat;
	/** Multiplier applied to the cutout's natural size. */
	scale: number;
	/** 0 - 1, used for JPEG and WebP. */
	quality: number;
}

export interface ExportOptionsProps {
	value: ExportConfig;
	onChange: (next: ExportConfig) => void;
}
