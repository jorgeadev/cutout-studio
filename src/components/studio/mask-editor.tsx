import { Eraser, LoaderCircle, Paintbrush, RotateCcw, Save, Undo2, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadImage } from "@/lib/image-utils";
import { canvasPointFromClient, drawEditorStroke, encodeCanvasPng } from "@/lib/mask-editor";
import { cn } from "@/lib/utils";
import type { EditorStroke, MaskEditorProps, MaskEditorTool } from "@/types/editor";

export const MaskEditor = ({ job, onClose, onImprove, onSave }: MaskEditorProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const originalImageRef = useRef<HTMLImageElement>(null);
	const cutoutImageRef = useRef<HTMLImageElement>(null);
	const activeStrokeRef = useRef<EditorStroke>(null);
	const [tool, setTool] = useState<MaskEditorTool>("restore");
	const [brushSize, setBrushSize] = useState(64);
	const [strength, setStrength] = useState(100);
	const [zoom, setZoom] = useState(100);
	const [strokes, setStrokes] = useState<EditorStroke[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();

	const redraw = useCallback((nextStrokes: EditorStroke[]) => {
		const canvas = canvasRef.current;
		const originalImage = originalImageRef.current;
		const cutoutImage = cutoutImageRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context || !originalImage || !cutoutImage) return;

		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(cutoutImage, 0, 0, canvas.width, canvas.height);
		for (const stroke of nextStrokes) drawEditorStroke(context, stroke, originalImage);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(undefined);

		const initialize = async () => {
			if (!job.cutoutUrl) throw new Error("This image does not have an editable cutout yet");
			const [originalImage, cutoutImage] = await Promise.all([loadImage(job.originalUrl), loadImage(job.cutoutUrl)]);
			if (cancelled) return;

			const canvas = canvasRef.current;
			const context = canvas?.getContext("2d");
			if (!canvas || !context) throw new Error("Canvas editing is not available in this browser");
			canvas.width = originalImage.naturalWidth;
			canvas.height = originalImage.naturalHeight;
			originalImageRef.current = originalImage;
			cutoutImageRef.current = cutoutImage;
			context.drawImage(cutoutImage, 0, 0, canvas.width, canvas.height);
			setLoading(false);
		};

		initialize().catch((reason: unknown) => {
			if (cancelled) return;
			setError(reason instanceof Error ? reason.message : "Could not open the mask editor");
			setLoading(false);
		});

		return () => {
			cancelled = true;
		};
	}, [job.cutoutUrl, job.originalUrl]);

	const handleUndo = useCallback(() => {
		setStrokes((current) => {
			const next = current.slice(0, -1);
			redraw(next);
			return next;
		});
	}, [redraw]);

	const handleReset = useCallback(() => {
		setStrokes([]);
		redraw([]);
	}, [redraw]);

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				handleUndo();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", handleKeyDown);
			previousFocus?.focus();
		};
	}, [handleUndo, onClose]);

	const pointFromPointer = useCallback((clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		return canvasPointFromClient(clientX, clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
	}, []);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			const context = canvas?.getContext("2d");
			const originalImage = originalImageRef.current;
			const point = pointFromPointer(event.clientX, event.clientY);
			if (!canvas || !context || !originalImage || !point || loading || error) return;

			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			const stroke: EditorStroke = { tool, size: brushSize, strength: strength / 100, points: [point] };
			activeStrokeRef.current = stroke;
			drawEditorStroke(context, stroke, originalImage);
		},
		[brushSize, error, loading, pointFromPointer, strength, tool],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const activeStroke = activeStrokeRef.current;
			const canvas = canvasRef.current;
			const context = canvas?.getContext("2d");
			const originalImage = originalImageRef.current;
			const point = pointFromPointer(event.clientX, event.clientY);
			const previousPoint = activeStroke?.points.at(-1);
			if (!activeStroke || !canvas || !context || !originalImage || !point || !previousPoint) return;

			event.preventDefault();
			activeStroke.points.push(point);
			drawEditorStroke(context, { ...activeStroke, points: [previousPoint, point] }, originalImage);
		},
		[pointFromPointer],
	);

	const finishStroke = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
		const activeStroke = activeStrokeRef.current;
		if (!activeStroke) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		setStrokes((current) => [...current, { ...activeStroke, points: [...activeStroke.points] }]);
		activeStrokeRef.current = null;
	}, []);

	const handleSave = useCallback(async () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		setSaving(true);
		setError(undefined);
		try {
			const blob = await encodeCanvasPng(canvas);
			onSave(job.id, blob);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not save the edited cutout");
			setSaving(false);
		}
	}, [job.id, onSave]);

	const handleImprove = useCallback(() => {
		onImprove(job.id);
		onClose();
	}, [job.id, onClose, onImprove]);

	return (
		<div className="fixed inset-0 z-50 flex bg-black/75 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="mask-editor-title">
			<div className="m-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
				<header className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Paintbrush className="size-4" aria-hidden="true" />
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h2 id="mask-editor-title" className="truncate text-sm font-semibold">
								Refine {job.name}
							</h2>
							<Badge variant="outline" className="hidden text-[9px] sm:inline-flex">
								Local editor
							</Badge>
						</div>
						<p className="truncate text-xs text-muted-foreground">Paint the mask to restore missing details or erase leftover background.</p>
					</div>
					<Button type="button" variant="ghost" size="icon" aria-label="Close mask editor" autoFocus onClick={onClose}>
						<X aria-hidden="true" />
					</Button>
				</header>

				<div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[15rem_minmax(0,1fr)] lg:overflow-hidden">
					<aside className="order-2 flex flex-col gap-5 border-t border-border p-4 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
						<div>
							<p className="mb-2 text-xs font-semibold">Brush mode</p>
							<div className="grid grid-cols-2 gap-2">
								{(
									[
										{ value: "restore", label: "Restore", icon: Paintbrush },
										{ value: "erase", label: "Erase", icon: Eraser },
									] as const
								).map(({ value, label, icon: Icon }) => (
									<button
										key={value}
										type="button"
										aria-pressed={tool === value}
										onClick={() => setTool(value)}
										className={cn(
											"flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											tool === value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary/50 hover:bg-[var(--control-hover)]",
										)}
									>
										<Icon className="size-4" aria-hidden="true" />
										{label}
									</button>
								))}
							</div>
							<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
								{tool === "restore" ? "Restore paints pixels from the original photo back into the subject." : "Erase makes unwanted pixels transparent."}
							</p>
						</div>

						<label className="grid gap-2 text-xs font-medium">
							<span className="flex items-center justify-between gap-3">
								Brush size <output className="font-mono text-[10px] text-muted-foreground">{brushSize}px</output>
							</span>
							<input
								type="range"
								min={8}
								max={240}
								step={4}
								value={brushSize}
								onChange={(event) => setBrushSize(Number(event.target.value))}
								className="w-full cursor-pointer accent-primary"
							/>
						</label>

						<label className="grid gap-2 text-xs font-medium">
							<span className="flex items-center justify-between gap-3">
								Strength <output className="font-mono text-[10px] text-muted-foreground">{strength}%</output>
							</span>
							<input
								type="range"
								min={10}
								max={100}
								step={5}
								value={strength}
								onChange={(event) => setStrength(Number(event.target.value))}
								className="w-full cursor-pointer accent-primary"
							/>
						</label>

						<div className="grid grid-cols-2 gap-2">
							<Button type="button" variant="outline" size="sm" disabled={!strokes.length || loading} onClick={handleUndo}>
								<Undo2 data-icon="inline-start" aria-hidden="true" />
								Undo
							</Button>
							<Button type="button" variant="outline" size="sm" disabled={!strokes.length || loading} onClick={handleReset}>
								<RotateCcw data-icon="inline-start" aria-hidden="true" />
								Reset
							</Button>
						</div>

						<div className="mt-auto rounded-lg border border-primary/20 bg-primary/5 p-3">
							<div className="flex items-start gap-2">
								<WandSparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
								<div>
									<p className="text-xs font-semibold">Try AI Precision</p>
									<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Rerun with the full 32-bit IS-Net model and Hair Detail sharpening for wispy edges.</p>
								</div>
							</div>
							<Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={handleImprove}>
								<WandSparkles data-icon="inline-start" aria-hidden="true" />
								Run precision pass
							</Button>
						</div>
					</aside>

					<div className="order-1 flex min-h-60 min-w-0 flex-col bg-muted/30 lg:order-2 lg:min-h-0">
						<div className="checkerboard relative min-h-0 flex-1 overflow-auto">
							<div className="flex min-h-full min-w-full items-center justify-center p-4 sm:p-6">
								<canvas
									ref={canvasRef}
									aria-label={`Editable background removal mask for ${job.name}`}
									className={cn("h-auto max-w-none touch-none border border-border bg-transparent shadow-lg", !loading && !error && "cursor-crosshair")}
									style={{ width: `${zoom}%` }}
									onPointerDown={handlePointerDown}
									onPointerMove={handlePointerMove}
									onPointerUp={finishStroke}
									onPointerCancel={finishStroke}
								>
									Your browser does not support canvas editing.
								</canvas>
							</div>
							{loading ? (
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm">
									<LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
									<p className="text-xs font-medium">Preparing full-resolution canvas…</p>
								</div>
							) : null}
						</div>

						<div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-2.5 sm:px-4">
							<div className="flex items-center gap-1">
								<Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={zoom <= 25} onClick={() => setZoom((current) => Math.max(25, current - 25))}>
									<ZoomOut aria-hidden="true" />
								</Button>
								<input
									type="range"
									aria-label="Canvas zoom"
									min={25}
									max={200}
									step={25}
									value={zoom}
									onChange={(event) => setZoom(Number(event.target.value))}
									className="w-24 cursor-pointer accent-primary sm:w-32"
								/>
								<Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoom((current) => Math.min(200, current + 25))}>
									<ZoomIn aria-hidden="true" />
								</Button>
								<output className="w-10 text-right font-mono text-[10px] text-muted-foreground">{zoom}%</output>
							</div>
							<p className="min-w-0 flex-1 text-right text-[11px] text-muted-foreground">
								{strokes.length ? `${strokes.length} edit${strokes.length === 1 ? "" : "s"}` : "No manual edits"}
							</p>
						</div>
					</div>
				</div>

				<footer className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-3 sm:justify-end sm:px-4">
					{error ? <p className="mr-auto text-xs text-destructive">{error}</p> : <p className="mr-auto text-[11px] text-muted-foreground">Nothing leaves your browser.</p>}
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button type="button" disabled={loading || saving || !strokes.length || Boolean(error)} onClick={handleSave}>
						{saving ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Save data-icon="inline-start" aria-hidden="true" />}
						{saving ? "Saving…" : "Save refinement"}
					</Button>
				</footer>
			</div>
		</div>
	);
};
