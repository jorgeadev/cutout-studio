import type { BackgroundConfig } from "@/types/background";
import type { ExportConfig, OutputFormat } from "@/types/export";
import type { ImageJob } from "@/types/job";

/** CSS value for the chosen background, or null when transparent. */
export const backgroundToCss = (bg: BackgroundConfig): string | null => {
	if (bg.kind === "transparent") return null;
	if (bg.kind === "solid") return bg.color;
	return `linear-gradient(${bg.angle}deg, ${bg.color}, ${bg.color2})`;
};

export const isValidHex = (value: string): boolean => {
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
};

export const normalizeHex = (value: string): string => {
	let v = value.trim();
	if (!v.startsWith("#")) v = `#${v}`;
	if (/^#([0-9a-f]{3})$/i.test(v)) {
		v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
	}
	return v.toLowerCase();
};

/** Relative luminance based contrast helper so labels stay readable on swatches. */
export const readableTextColor = (hex: string): string => {
	const h = normalizeHex(hex);
	if (!isValidHex(h)) return "#000000";
	const r = Number.parseInt(h.slice(1, 3), 16) / 255;
	const g = Number.parseInt(h.slice(3, 5), 16) / 255;
	const b = Number.parseInt(h.slice(5, 7), 16) / 255;
	const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	return l > 0.45 ? "#000000" : "#ffffff";
};

export const formatBytes = (bytes: number): string => {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const extensionFor = (format: OutputFormat): string => {
	if (format === "image/jpeg") return "jpg";
	if (format === "image/webp") return "webp";
	return "png";
};

export const outputFileName = (name: string, format: OutputFormat): string => {
	const base = name.replace(/\.[^./\\]+$/, "") || "image";
	return `${base}-nobg.${extensionFor(format)}`;
};

export const loadImage = (src: string): Promise<HTMLImageElement> => {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not decode image"));
		img.src = src;
	});
};

const paintGradient = (ctx: CanvasRenderingContext2D, bg: BackgroundConfig, w: number, h: number) => {
	const rad = (bg.angle * Math.PI) / 180;
	// CSS angles: 0deg points to the top, growing clockwise.
	const dx = Math.sin(rad);
	const dy = -Math.cos(rad);
	const len = Math.abs(w * dx) + Math.abs(h * dy);
	const cx = w / 2;
	const cy = h / 2;
	const grad = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
	grad.addColorStop(0, bg.color);
	grad.addColorStop(1, bg.color2);
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, h);
};

/** Composites the cutout onto the chosen background and encodes it. */
export const renderJob = async (job: ImageJob, bg: BackgroundConfig, exp: ExportConfig): Promise<Blob> => {
	if (!job.cutoutUrl) throw new Error("Image has not been processed yet");
	const img = await loadImage(job.cutoutUrl);
	const w = Math.max(1, Math.round(img.naturalWidth * exp.scale));
	const h = Math.max(1, Math.round(img.naturalHeight * exp.scale));

	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas is not available");
	ctx.imageSmoothingQuality = "high";

	const opaqueFormat = exp.format !== "image/png";
	if (bg.kind === "solid") {
		ctx.fillStyle = bg.color;
		ctx.fillRect(0, 0, w, h);
	} else if (bg.kind === "gradient") {
		paintGradient(ctx, bg, w, h);
	} else if (opaqueFormat) {
		// JPEG has no alpha channel, fall back to white so it is not black.
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, w, h);
	}

	ctx.drawImage(img, 0, 0, w, h);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), exp.format, exp.format === "image/png" ? undefined : exp.quality);
	});
};

export const triggerDownload = (blob: Blob, fileName: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
};
