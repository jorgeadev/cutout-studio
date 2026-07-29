export type ModelQuality = "isnet_quint8" | "isnet_fp16" | "isnet";

export type MatteAlgorithm = "natural" | "refine" | "hair" | "soft" | "hard";

export type ProcessingDevice = "auto" | "gpu" | "cpu";

export interface ProcessingConfig {
	model: ModelQuality;
	algorithm: MatteAlgorithm;
	device: ProcessingDevice;
}

export interface RemoveOptions extends ProcessingConfig {
	onProgress?: (fraction: number, stage: string) => void;
}

export interface PreloadOptions {
	model: ModelQuality;
	device: ProcessingDevice;
	onProgress?: (fraction: number, stage: string) => void;
}

export interface ModelOption {
	value: ModelQuality;
	name: string;
	precision: string;
	size: string;
	description: string;
	recommended?: boolean;
}

export interface AlgorithmOption {
	value: MatteAlgorithm;
	name: string;
	description: string;
}

export interface DeviceOption {
	value: ProcessingDevice;
	name: string;
	description: string;
}

export type ModelDownloadStatus = "idle" | "downloading" | "ready" | "error";

export interface ModelDownloadState {
	status: ModelDownloadStatus;
	progress: number;
	stage?: string;
}

export interface ProcessingOptionsProps {
	value: ProcessingConfig;
	onChange: (next: ProcessingConfig) => void;
	downloads: Record<ModelQuality, ModelDownloadState>;
	onPrepareModel: (model: ModelQuality) => void;
	disabled?: boolean;
}

export interface WebGpuProvider {
	requestAdapter: () => Promise<unknown | null>;
}

export interface WebGpuNavigator {
	gpu?: WebGpuProvider;
}
