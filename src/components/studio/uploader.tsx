import { Camera, ClipboardPaste, ImagePlus, Sparkles, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploaderProps } from "@/types/uploader";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif";

export const Uploader = ({ onFiles, disabled }: UploaderProps) => {
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cameraInputRef = useRef<HTMLInputElement>(null);

	// Paste images straight from the clipboard.
	useEffect(() => {
		const handlePaste = (event: ClipboardEvent) => {
			const items = event.clipboardData?.files;
			if (!items?.length) return;
			const images = Array.from(items).filter((file) => file.type.startsWith("image/"));
			if (images.length) {
				event.preventDefault();
				onFiles(images);
			}
		};
		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [onFiles]);

	const pick = (list: FileList | null) => {
		if (!list) return;
		const images = Array.from(list).filter((file) => file.type.startsWith("image/"));
		if (images.length) onFiles(images);
	};

	return (
		<section
			aria-label="Image upload drop zone"
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				pick(event.dataTransfer.files);
			}}
			className={cn(
				"group relative flex w-full min-w-0 flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card p-6 text-center shadow-sm transition-all hover:border-primary/40 hover:shadow-md",
				dragging && "scale-[1.01] border-primary bg-primary/5 shadow-md shadow-primary/10",
				disabled && "pointer-events-none opacity-60",
			)}
		>
			<div className="pointer-events-none absolute inset-x-8 -top-12 h-24 rounded-full bg-primary/10 blur-2xl" />
			<div className="relative flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5">
				<UploadCloud className="size-5" aria-hidden="true" />
			</div>
			<div className="relative flex flex-col gap-1">
				<p className="text-sm font-semibold leading-relaxed">Drop images to start</p>
				<p className="text-xs leading-relaxed text-muted-foreground">PNG, JPG, WebP, GIF, BMP, or AVIF. Up to 40 files per batch.</p>
			</div>

			<div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
				<Button type="button" onClick={() => fileInputRef.current?.click()}>
					<ImagePlus data-icon="inline-start" aria-hidden="true" />
					Choose images
				</Button>
				<Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()}>
					<Camera data-icon="inline-start" aria-hidden="true" />
					Camera
				</Button>
			</div>

			<div className="relative flex flex-col items-center gap-2">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<ClipboardPaste className="size-3.5" aria-hidden="true" />
					You can also paste from the clipboard
				</p>
				<Button
					type="button"
					variant="link"
					size="sm"
					onClick={async () => {
						const response = await fetch("/sample-subject.png");
						const blob = await response.blob();
						onFiles([new File([blob], "sample-monstera.png", { type: blob.type })]);
					}}
				>
					<Sparkles data-icon="inline-start" aria-hidden="true" />
					Try a sample image
				</Button>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPT}
				multiple
				className="sr-only"
				onChange={(event) => {
					pick(event.target.files);
					event.target.value = "";
				}}
			/>
			<input
				ref={cameraInputRef}
				type="file"
				accept="image/*"
				capture="environment"
				className="sr-only"
				onChange={(event) => {
					pick(event.target.files);
					event.target.value = "";
				}}
			/>
		</section>
	);
};
