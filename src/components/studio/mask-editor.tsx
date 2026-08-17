import { ArrowLeft, ArrowLeftRight, Eraser, Hand, LoaderCircle, Paintbrush, RotateCcw, Save, Undo2, Upload, WandSparkles, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/studio/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadImage, MAX_CANVAS_SIDE } from "@/lib/image-utils";
import {
	applyMagicSelection,
	brushPreviewFromClient,
	canvasPointFromClient,
	clampEditorZoom,
	drawEditorStroke,
	editorZoomFromWheel,
	encodeCanvasPng,
	fitEditorZoom,
	imageMatchesCanvasAspectRatio,
	MAX_EDITOR_ZOOM,
	MIN_EDITOR_ZOOM,
	oppositeEditorTool,
	panScrollFromDrag,
} from "@/lib/mask-editor";
import { cn } from "@/lib/utils";
import type { EditorEdit, EditorMagicSelection, EditorStroke, MaskEditorProps, MaskEditorTool } from "@/types/editor";

type EditorSelectionMethod = "brush" | "magic";

export const MaskEditor = ({ job, onClose, onImprove, onSave }: MaskEditorProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const editedImageInputRef = useRef<HTMLInputElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const brushCursorRef = useRef<HTMLDivElement>(null);
	const originalImageRef = useRef<HTMLImageElement>(null);
	const originalPixelsRef = useRef<ImageData>(null);
	const cutoutImageRef = useRef<CanvasImageSource>(null);
	const activeStrokeRef = useRef<EditorStroke>(null);
	const panGestureRef = useRef<{ pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number }>(null);
	const lastPointerRef = useRef<{ clientX: number; clientY: number }>(null);
	const spacePanRef = useRef(false);
	const zoomRef = useRef(100);
	const pendingZoomAnchorRef = useRef<{ clientX: number; clientY: number; relativeX: number; relativeY: number }>(null);
	const [tool, setTool] = useState<MaskEditorTool>("restore");
	const [selectionMethod, setSelectionMethod] = useState<EditorSelectionMethod>("brush");
	const [brushSize, setBrushSize] = useState(64);
	const [strength, setStrength] = useState(100);
	const [magicTolerance, setMagicTolerance] = useState(18);
	const [magicResult, setMagicResult] = useState<string>();
	const [zoom, setZoom] = useState(100);
	const [panToolActive, setPanToolActive] = useState(false);
	const [spacePanActive, setSpacePanActive] = useState(false);
	const [panning, setPanning] = useState(false);
	const [edits, setEdits] = useState<EditorEdit[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingEditedImage, setLoadingEditedImage] = useState(false);
	const [loadedEditedImageName, setLoadedEditedImageName] = useState<string>();
	const [loadEditedImageError, setLoadEditedImageError] = useState<string>();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();

	const redraw = useCallback((nextEdits: EditorEdit[]) => {
		const canvas = canvasRef.current;
		const originalImage = originalImageRef.current;
		const originalPixels = originalPixelsRef.current;
		const cutoutImage = cutoutImageRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context || !originalImage || !cutoutImage) return;

		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(cutoutImage, 0, 0, canvas.width, canvas.height);
		for (const edit of nextEdits) {
			if ("kind" in edit) {
				if (originalPixels) applyMagicSelection(context, edit, originalPixels);
			} else {
				drawEditorStroke(context, edit, originalImage);
			}
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(undefined);
		setEdits([]);
		setMagicResult(undefined);
		setLoadedEditedImageName(undefined);
		setLoadEditedImageError(undefined);
		originalPixelsRef.current = null;

		const initialize = async () => {
			if (!job.cutoutUrl) throw new Error("This image does not have an editable cutout yet");
			const [originalImage, cutoutImage] = await Promise.all([loadImage(job.originalUrl), loadImage(job.cutoutUrl)]);
			if (cancelled) return;

			const canvas = canvasRef.current;
			const context = canvas?.getContext("2d", { willReadFrequently: true });
			if (!canvas || !context) throw new Error("Canvas editing is not available in this browser");
			// A 48 MP source would allocate hundreds of MB and crash mobile
			// browsers; cap the editable canvas at a safe resolution instead.
			const editScale = Math.min(1, MAX_CANVAS_SIDE / Math.max(originalImage.naturalWidth, originalImage.naturalHeight));
			canvas.width = Math.max(1, Math.round(originalImage.naturalWidth * editScale));
			canvas.height = Math.max(1, Math.round(originalImage.naturalHeight * editScale));
			originalImageRef.current = originalImage;
			cutoutImageRef.current = cutoutImage;
			const originalCanvas = document.createElement("canvas");
			originalCanvas.width = canvas.width;
			originalCanvas.height = canvas.height;
			const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
			if (!originalContext) throw new Error("Magic selection is not available in this browser");
			originalContext.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
			originalPixelsRef.current = originalContext.getImageData(0, 0, canvas.width, canvas.height);
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
		setEdits((current) => {
			const next = current.slice(0, -1);
			redraw(next);
			setMagicResult(undefined);
			return next;
		});
	}, [redraw]);

	const handleReset = useCallback(() => {
		setEdits([]);
		setMagicResult(undefined);
		redraw([]);
	}, [redraw]);

	const handleLoadEditedImage = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const input = event.currentTarget;
			const file = input.files?.[0];
			if (!file) return;
			if (edits.length && !window.confirm("Loading this image will replace your current unsaved brush and magic-selector edits. Continue?")) {
				input.value = "";
				return;
			}

			setLoadingEditedImage(true);
			setLoadEditedImageError(undefined);
			let imageUrl: string | undefined;
			try {
				imageUrl = URL.createObjectURL(file);
				const editedImage = await loadImage(imageUrl);
				const canvas = canvasRef.current;
				const context = canvas?.getContext("2d");
				if (!canvas || !context) throw new Error("Canvas editing is not available in this browser");
				if (!imageMatchesCanvasAspectRatio(editedImage.naturalWidth, editedImage.naturalHeight, canvas.width, canvas.height)) {
					throw new Error("Choose an edited version of this image with the same aspect ratio");
				}

				const importedCanvas = document.createElement("canvas");
				importedCanvas.width = canvas.width;
				importedCanvas.height = canvas.height;
				const importedContext = importedCanvas.getContext("2d");
				if (!importedContext) throw new Error("Could not prepare the edited image");
				importedContext.imageSmoothingEnabled = true;
				importedContext.imageSmoothingQuality = "high";
				importedContext.drawImage(editedImage, 0, 0, canvas.width, canvas.height);

				cutoutImageRef.current = importedCanvas;
				context.clearRect(0, 0, canvas.width, canvas.height);
				context.drawImage(importedCanvas, 0, 0);
				setEdits([]);
				setMagicResult(undefined);
				setLoadedEditedImageName(file.name);
			} catch (reason) {
				setLoadEditedImageError(reason instanceof Error ? reason.message : "Could not load the edited image");
			} finally {
				if (imageUrl) URL.revokeObjectURL(imageUrl);
				input.value = "";
				setLoadingEditedImage(false);
			}
		},
		[edits.length],
	);

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

	const updateBrushPreview = useCallback(
		(clientX: number, clientY: number) => {
			lastPointerRef.current = { clientX, clientY };
			const cursor = brushCursorRef.current;
			const viewport = viewportRef.current;
			const canvas = canvasRef.current;
			if (!cursor || !viewport || !canvas || loading || error || selectionMethod === "magic" || panToolActive || spacePanActive || panGestureRef.current) {
				if (cursor) cursor.style.opacity = "0";
				return;
			}

			const preview = brushPreviewFromClient(
				clientX,
				clientY,
				viewport.getBoundingClientRect(),
				canvas.getBoundingClientRect(),
				viewport.scrollLeft,
				viewport.scrollTop,
				canvas.width,
				brushSize,
			);
			if (!preview) {
				cursor.style.opacity = "0";
				return;
			}

			cursor.style.left = `${preview.left}px`;
			cursor.style.top = `${preview.top}px`;
			cursor.style.width = `${preview.diameter}px`;
			cursor.style.height = `${preview.diameter}px`;
			cursor.style.opacity = "1";
		},
		[brushSize, error, loading, panToolActive, selectionMethod, spacePanActive],
	);

	const hideBrushPreview = useCallback(() => {
		lastPointerRef.current = null;
		if (brushCursorRef.current) brushCursorRef.current.style.opacity = "0";
	}, []);

	useEffect(() => {
		const pointer = lastPointerRef.current;
		if (pointer) updateBrushPreview(pointer.clientX, pointer.clientY);
	}, [updateBrushPreview]);

	useEffect(() => {
		const isEditableTarget = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches("input, textarea, select, button") || target.isContentEditable);
		const stopSpacePan = () => {
			spacePanRef.current = false;
			setSpacePanActive(false);
		};
		const handleSpaceDown = (event: KeyboardEvent) => {
			if (event.code !== "Space" || isEditableTarget(event.target)) return;
			event.preventDefault();
			spacePanRef.current = true;
			setSpacePanActive(true);
		};
		const handleSpaceUp = (event: KeyboardEvent) => {
			if (event.code === "Space") stopSpacePan();
		};

		window.addEventListener("keydown", handleSpaceDown);
		window.addEventListener("keyup", handleSpaceUp);
		window.addEventListener("blur", stopSpacePan);
		return () => {
			window.removeEventListener("keydown", handleSpaceDown);
			window.removeEventListener("keyup", handleSpaceUp);
			window.removeEventListener("blur", stopSpacePan);
		};
	}, []);

	const setEditorZoom = useCallback((requestedZoom: number, clientX?: number, clientY?: number) => {
		const nextZoom = clampEditorZoom(requestedZoom);
		if (nextZoom === zoomRef.current) return;

		const viewport = viewportRef.current;
		const canvas = canvasRef.current;
		if (viewport && canvas) {
			const viewportBounds = viewport.getBoundingClientRect();
			const canvasBounds = canvas.getBoundingClientRect();
			const anchorClientX = clientX ?? viewportBounds.left + viewportBounds.width / 2;
			const anchorClientY = clientY ?? viewportBounds.top + viewportBounds.height / 2;
			pendingZoomAnchorRef.current = {
				clientX: anchorClientX,
				clientY: anchorClientY,
				relativeX: canvasBounds.width > 0 ? Math.max(0, Math.min(1, (anchorClientX - canvasBounds.left) / canvasBounds.width)) : 0.5,
				relativeY: canvasBounds.height > 0 ? Math.max(0, Math.min(1, (anchorClientY - canvasBounds.top) / canvasBounds.height)) : 0.5,
			};
		}

		zoomRef.current = nextZoom;
		setZoom(nextZoom);
	}, []);

	const fitCanvasToViewport = useCallback(() => {
		const viewport = viewportRef.current;
		const canvas = canvasRef.current;
		if (!viewport || !canvas || loading || error) return;
		setEditorZoom(fitEditorZoom(viewport.clientWidth, viewport.clientHeight, canvas.width, canvas.height));
	}, [error, loading, setEditorZoom]);

	useLayoutEffect(() => {
		const anchor = pendingZoomAnchorRef.current;
		const viewport = viewportRef.current;
		const canvas = canvasRef.current;
		if (anchor && viewport && canvas && zoom === zoomRef.current) {
			const canvasBounds = canvas.getBoundingClientRect();
			viewport.scrollLeft += canvasBounds.left + canvasBounds.width * anchor.relativeX - anchor.clientX;
			viewport.scrollTop += canvasBounds.top + canvasBounds.height * anchor.relativeY - anchor.clientY;
		}
		pendingZoomAnchorRef.current = null;

		const pointer = lastPointerRef.current;
		if (pointer) updateBrushPreview(pointer.clientX, pointer.clientY);
	}, [updateBrushPreview, zoom]);

	const handleWheelZoom = useCallback(
		(event: WheelEvent) => {
			if (loading || error || event.deltaY === 0) return;
			event.preventDefault();
			setEditorZoom(editorZoomFromWheel(zoomRef.current, event.deltaY, event.deltaMode), event.clientX, event.clientY);
		},
		[error, loading, setEditorZoom],
	);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		viewport.addEventListener("wheel", handleWheelZoom, { passive: false });
		return () => viewport.removeEventListener("wheel", handleWheelZoom);
	}, [handleWheelZoom]);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			updateBrushPreview(event.clientX, event.clientY);
			const canvas = canvasRef.current;
			const viewport = viewportRef.current;
			const context = canvas?.getContext("2d");
			const originalImage = originalImageRef.current;
			const originalPixels = originalPixelsRef.current;
			const point = pointFromPointer(event.clientX, event.clientY);
			if (!canvas || !viewport || !context || !originalImage || !originalPixels || !point || loading || loadingEditedImage || error) return;

			const shouldPan = (event.button === 0 && (panToolActive || spacePanRef.current)) || event.button === 1;
			if (shouldPan) {
				event.preventDefault();
				canvas.setPointerCapture(event.pointerId);
				panGestureRef.current = {
					pointerId: event.pointerId,
					clientX: event.clientX,
					clientY: event.clientY,
					scrollLeft: viewport.scrollLeft,
					scrollTop: viewport.scrollTop,
				};
				setPanning(true);
				if (brushCursorRef.current) brushCursorRef.current.style.opacity = "0";
				return;
			}
			if (event.button !== 0) return;

			event.preventDefault();
			const editTool = event.altKey ? oppositeEditorTool(tool) : tool;
			if (selectionMethod === "magic") {
				const selection: EditorMagicSelection = { kind: "magic", tool: editTool, point, tolerance: magicTolerance };
				const changedPixels = applyMagicSelection(context, selection, originalPixels);
				if (changedPixels) {
					setEdits((current) => [...current, selection]);
					setMagicResult(`${changedPixels.toLocaleString()} pixel${changedPixels === 1 ? "" : "s"} ${editTool === "erase" ? "made transparent" : "restored"}`);
				} else {
					setMagicResult(editTool === "erase" ? "No visible matching pixels found" : "No missing matching pixels found");
				}
				return;
			}

			canvas.setPointerCapture(event.pointerId);
			const stroke: EditorStroke = { tool: editTool, size: brushSize, strength: strength / 100, points: [point] };
			activeStrokeRef.current = stroke;
			drawEditorStroke(context, stroke, originalImage);
		},
		[brushSize, error, loading, loadingEditedImage, magicTolerance, panToolActive, pointFromPointer, selectionMethod, strength, tool, updateBrushPreview],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			updateBrushPreview(event.clientX, event.clientY);
			const panGesture = panGestureRef.current;
			const viewport = viewportRef.current;
			if (panGesture?.pointerId === event.pointerId && viewport) {
				event.preventDefault();
				const nextScroll = panScrollFromDrag(panGesture.scrollLeft, panGesture.scrollTop, panGesture.clientX, panGesture.clientY, event.clientX, event.clientY);
				viewport.scrollLeft = nextScroll.left;
				viewport.scrollTop = nextScroll.top;
				return;
			}
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
		[pointFromPointer, updateBrushPreview],
	);

	const finishPointerInteraction = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			if (panGestureRef.current?.pointerId === event.pointerId) {
				panGestureRef.current = null;
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
				setPanning(false);
				updateBrushPreview(event.clientX, event.clientY);
				return;
			}
			const activeStroke = activeStrokeRef.current;
			if (!activeStroke) return;
			if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			setEdits((current) => [...current, { ...activeStroke, points: [...activeStroke.points] }]);
			activeStrokeRef.current = null;
		},
		[updateBrushPreview],
	);

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
	}, [job.id, onImprove]);

	return (
		<main data-page="mask-editor" className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground" aria-labelledby="mask-editor-title">
			<header className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-3 py-3 sm:px-5">
				<Button type="button" variant="ghost" size="sm" aria-label="Back to studio" autoFocus onClick={onClose}>
					<ArrowLeft data-icon="inline-start" aria-hidden="true" />
					<span className="hidden sm:inline">Back to studio</span>
				</Button>
				<div className="h-6 w-px bg-border" aria-hidden="true" />
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Paintbrush className="size-4" aria-hidden="true" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 id="mask-editor-title" className="truncate text-sm font-semibold">
							Refine {job.name}
						</h1>
						<Badge variant="outline" className="hidden text-[9px] sm:inline-flex">
							Editor workspace
						</Badge>
					</div>
					<p className="truncate text-xs text-muted-foreground">Brush or select regions to restore details and remove leftover background.</p>
				</div>
				<ThemeToggle />
			</header>

			<div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)] lg:overflow-hidden">
				<aside className="order-2 flex flex-col gap-5 border-t border-border bg-card p-4 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
					<div>
						<p className="mb-2 text-xs font-semibold">Edit action</p>
						<div className="grid grid-cols-2 gap-2">
							{(
								[
									{ value: "restore", label: "Restore pixels", icon: Paintbrush },
									{ value: "erase", label: "Make transparent", icon: Eraser },
								] as const
							).map(({ value, label, icon: Icon }) => (
								<button
									key={value}
									type="button"
									aria-pressed={tool === value}
									onClick={() => {
										setTool(value);
										setPanToolActive(false);
									}}
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
							{tool === "restore" ? "Bring pixels from the original photo back into the cutout." : "Remove pixels from the cutout to create transparent space."}
						</p>
						<Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => setTool((current) => oppositeEditorTool(current))}>
							<ArrowLeftRight data-icon="inline-start" aria-hidden="true" />
							Switch to {tool === "restore" ? "transparent" : "restore"}
						</Button>
						<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Tip: hold Alt while painting or selecting to temporarily use the opposite action.</p>
					</div>

					<div>
						<p className="mb-2 text-xs font-semibold">Selection method</p>
						<div className="grid grid-cols-2 gap-2">
							{(
								[
									{ value: "brush", label: "Brush", icon: Paintbrush },
									{ value: "magic", label: "Magic selector", icon: WandSparkles },
								] as const
							).map(({ value, label, icon: Icon }) => (
								<button
									key={value}
									type="button"
									aria-pressed={selectionMethod === value}
									onClick={() => {
										setSelectionMethod(value);
										setPanToolActive(false);
										setMagicResult(undefined);
									}}
									className={cn(
										"flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										selectionMethod === value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary/50 hover:bg-[var(--control-hover)]",
									)}
								>
									<Icon className="size-4" aria-hidden="true" />
									{label}
								</button>
							))}
						</div>
						<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
							{selectionMethod === "brush" ? "Drag to edit continuously with the selected brush action." : "Click once to edit a connected region with similar colors."}
						</p>
					</div>

					{selectionMethod === "brush" ? (
						<>
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
						</>
					) : (
						<label className="grid gap-2 text-xs font-medium">
							<span className="flex items-center justify-between gap-3">
								Color tolerance <output className="font-mono text-[10px] text-muted-foreground">{magicTolerance}%</output>
							</span>
							<input
								type="range"
								aria-label="Magic selection color tolerance"
								min={0}
								max={100}
								step={1}
								value={magicTolerance}
								onChange={(event) => {
									setMagicTolerance(Number(event.target.value));
									setMagicResult(undefined);
								}}
								className="w-full cursor-pointer accent-primary"
							/>
							<span aria-live="polite" className="text-[10px] font-normal leading-relaxed text-muted-foreground">
								{magicResult ?? "Lower selects closer colors; higher includes a broader connected area."}
							</span>
						</label>
					)}

					<div className="grid grid-cols-2 gap-2">
						<Button type="button" variant="outline" size="sm" disabled={!edits.length || loading || loadingEditedImage} onClick={handleUndo}>
							<Undo2 data-icon="inline-start" aria-hidden="true" />
							Undo
						</Button>
						<Button type="button" variant="outline" size="sm" disabled={!edits.length || loading || loadingEditedImage} onClick={handleReset}>
							<RotateCcw data-icon="inline-start" aria-hidden="true" />
							Reset
						</Button>
					</div>

					<div className="rounded-lg border border-border bg-background p-3">
						<p className="text-xs font-semibold">Reuse a previous edit</p>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Load a transparent PNG or WebP downloaded earlier instead of repeating the same edits.</p>
						<input
							ref={editedImageInputRef}
							type="file"
							accept="image/png,image/webp,.png,.webp"
							aria-label="Choose a previously edited image"
							className="sr-only"
							onChange={handleLoadEditedImage}
						/>
						<Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled={loading || loadingEditedImage} onClick={() => editedImageInputRef.current?.click()}>
							{loadingEditedImage ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Upload data-icon="inline-start" aria-hidden="true" />}
							{loadingEditedImage ? "Loading edit…" : "Load edited image"}
						</Button>
						{loadEditedImageError ? (
							<p role="alert" className="mt-2 text-[10px] leading-relaxed text-destructive">
								{loadEditedImageError}
							</p>
						) : loadedEditedImageName ? (
							<p className="mt-2 truncate text-[10px] text-primary" title={loadedEditedImageName}>
								Loaded: {loadedEditedImageName}
							</p>
						) : null}
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
					<div ref={viewportRef} className="checkerboard relative min-h-0 flex-1 overflow-auto" title="Use the mouse wheel to zoom and drag with the Pan tool">
						<div className="flex min-h-full w-full min-w-0 p-4 sm:p-6">
							<canvas
								ref={canvasRef}
								aria-label={`Editable background removal mask for ${job.name}`}
								className={cn(
									"m-auto h-auto max-w-none touch-none border border-border bg-transparent shadow-lg",
									!loading &&
										!error &&
										(panning ? "cursor-grabbing" : panToolActive || spacePanActive ? "cursor-grab" : selectionMethod === "magic" ? "cursor-crosshair" : "cursor-none"),
								)}
								// A canvas is a replaced flex item. Without this, flexbox
								// shrinks high zoom levels back to its intrinsic pixel width.
								style={{ width: `${zoom}%`, flexShrink: 0 }}
								onPointerDown={handlePointerDown}
								onPointerEnter={(event) => updateBrushPreview(event.clientX, event.clientY)}
								onPointerLeave={hideBrushPreview}
								onPointerMove={handlePointerMove}
								onPointerUp={finishPointerInteraction}
								onPointerCancel={finishPointerInteraction}
							>
								Your browser does not support canvas editing.
							</canvas>
						</div>
						<div
							ref={brushCursorRef}
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute z-20 box-border -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/95 bg-white/25 opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.9),0_2px_8px_rgba(0,0,0,0.35)] transition-[width,height,opacity] duration-75 after:absolute after:top-1/2 after:left-1/2 after:size-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:shadow-[0_0_0_1px_rgba(255,255,255,0.95)]",
								tool === "erase" ? "after:bg-destructive" : "after:bg-primary",
							)}
						/>
						{loading ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm">
								<LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
								<p className="text-xs font-medium">Preparing full-resolution canvas…</p>
							</div>
						) : null}
					</div>

					<div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-2.5 sm:px-4">
						<div className="flex flex-wrap items-center gap-1">
							<Button
								type="button"
								variant={panToolActive ? "secondary" : "outline"}
								size="sm"
								aria-pressed={panToolActive}
								title="Drag the canvas. Hold Space for temporary pan."
								disabled={loading || Boolean(error)}
								onClick={() => setPanToolActive((current) => !current)}
							>
								<Hand data-icon="inline-start" aria-hidden="true" />
								Pan
							</Button>
							<Button type="button" variant="outline" size="sm" disabled={loading || Boolean(error)} onClick={fitCanvasToViewport}>
								Fit
							</Button>
							<Button type="button" variant="outline" size="sm" disabled={loading || Boolean(error)} onClick={() => setEditorZoom(100)}>
								100%
							</Button>
							<Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={zoom <= MIN_EDITOR_ZOOM} onClick={() => setEditorZoom(zoomRef.current - 10)}>
								<ZoomOut aria-hidden="true" />
							</Button>
							<input
								type="range"
								aria-label="Canvas zoom"
								min={MIN_EDITOR_ZOOM}
								max={MAX_EDITOR_ZOOM}
								step={1}
								value={zoom}
								onChange={(event) => setEditorZoom(Number(event.target.value))}
								className="w-20 cursor-pointer accent-primary sm:w-28"
							/>
							<Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={zoom >= MAX_EDITOR_ZOOM} onClick={() => setEditorZoom(zoomRef.current + 10)}>
								<ZoomIn aria-hidden="true" />
							</Button>
							<label className="flex items-center gap-1 text-[10px] text-muted-foreground">
								<span className="sr-only">Exact canvas zoom percentage</span>
								<input
									type="number"
									min={MIN_EDITOR_ZOOM}
									max={MAX_EDITOR_ZOOM}
									step={1}
									value={zoom}
									onChange={(event) => {
										if (Number.isFinite(event.currentTarget.valueAsNumber)) setEditorZoom(event.currentTarget.valueAsNumber);
									}}
									className="h-7 w-14 rounded-md border border-input bg-background px-1 text-right font-mono text-[10px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
								%
							</label>
						</div>
						<p className="hidden text-[11px] text-muted-foreground md:block">
							Wheel zoom · Space + drag pan · {MIN_EDITOR_ZOOM}–{MAX_EDITOR_ZOOM}%
						</p>
						<p className="min-w-0 flex-1 text-right text-[11px] text-muted-foreground">
							{edits.length ? `${edits.length} edit${edits.length === 1 ? "" : "s"}` : loadedEditedImageName ? "Loaded edit ready" : "No manual edits"}
						</p>
					</div>
				</div>
			</div>

			<footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background px-3 py-3 sm:justify-end sm:px-5">
				{error ? <p className="mr-auto text-xs text-destructive">{error}</p> : <p className="mr-auto text-[11px] text-muted-foreground">Nothing leaves your browser.</p>}
				<Button type="button" variant="outline" onClick={onClose}>
					Cancel
				</Button>
				<Button type="button" disabled={loading || loadingEditedImage || saving || (!edits.length && !loadedEditedImageName) || Boolean(error)} onClick={handleSave}>
					{saving ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Save data-icon="inline-start" aria-hidden="true" />}
					{saving ? "Saving…" : "Save refinement"}
				</Button>
			</footer>
		</main>
	);
};
