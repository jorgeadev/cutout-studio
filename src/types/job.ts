import type { ProcessingConfig } from "./processing";

export type JobStatus = "queued" | "processing" | "done" | "error";

export interface ImageJob {
	id: string;
	file: File;
	name: string;
	size: number;
	originalUrl: string;
	cutoutUrl?: string;
	width?: number;
	height?: number;
	status: JobStatus;
	/** 0 - 1 */
	progress: number;
	stage?: string;
	error?: string;
	/** Milliseconds spent removing the background. */
	duration?: number;
	/** Settings captured when this job started. */
	processing?: ProcessingConfig;
}

export interface JobCardProps {
	job: ImageJob;
	backgroundCss: string | null;
	onDownload: (job: ImageJob) => void;
	onRetry: (id: string) => void;
	onRemove: (id: string) => void;
}

export interface JobQueueProps {
	jobs: ImageJob[];
	onDownload: (job: ImageJob) => void;
	onRetry: (id: string) => void;
	onRemove: (id: string) => void;
}

export interface StatusBadgeProps {
	job: ImageJob;
}
