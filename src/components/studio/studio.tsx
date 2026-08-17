import { CloudOff, CodeXml, FileArchive, HardDrive, Images, Layers, ShieldCheck, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BackgroundPicker } from "@/components/studio/background-picker";
import { ExportOptions } from "@/components/studio/export-options";
import { JobCard } from "@/components/studio/job-card";
import { JobQueue } from "@/components/studio/job-queue";
import { MaskEditor } from "@/components/studio/mask-editor";
import { ProcessingOptions } from "@/components/studio/processing-options";
import { ThemeToggle } from "@/components/studio/theme-toggle";
import { Uploader } from "@/components/studio/uploader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { createCutoutProject, cutoutProjectFileName, MAX_CUTOUT_PROJECT_BYTES, readCutoutProject } from "@/lib/cutout-project";
import { DEFAULT_BACKGROUND, DEFAULT_EXPORT, DEFAULT_PROCESSING } from "@/lib/defaults";
import { backgroundToCss, loadImage, outputFileName, renderJob, renderProjectPreview, triggerDownload } from "@/lib/image-utils";
import { imageMatchesCanvasAspectRatio } from "@/lib/mask-editor";
import { precisionProcessingConfig } from "@/lib/processing-options";
import { preloadBackgroundModel, removeImageBackground } from "@/lib/remove-background";
import type { BackgroundConfig } from "@/types/background";
import type { ExportConfig } from "@/types/export";
import type { ImageJob } from "@/types/job";
import type { ModelDownloadState, ModelQuality, ProcessingConfig } from "@/types/processing";

const MAX_FILES = 40;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 15 * 1000;
const SETTINGS_KEY = "cutout-studio-settings";
const LEGACY_SETTINGS_KEY = "cutout-settings";
const EDITOR_HISTORY_KEY = "cutoutStudioEditor";
const EMPTY_DOWNLOAD: ModelDownloadState = { status: "idle", progress: 0 };

const safeObjectUrl = (blob: Blob): string | undefined => {
	try {
		return URL.createObjectURL(blob);
	} catch {
		return undefined;
	}
};

const createProjectForJob = async (job: ImageJob): Promise<Blob> => {
	if (!job.cutoutUrl) throw new Error("Image has not been processed yet");
	const response = await fetch(job.cutoutUrl);
	if (!response.ok) throw new Error("Could not read the edited result");
	const [edited, preview] = await Promise.all([response.blob(), renderProjectPreview(job.cutoutUrl)]);
	return createCutoutProject({ original: job.file, originalName: job.name, edited, preview });
};

const initialDownloads = (): Record<ModelQuality, ModelDownloadState> => {
	return {
		isnet_quint8: { ...EMPTY_DOWNLOAD },
		isnet_fp16: { ...EMPTY_DOWNLOAD },
		isnet: { ...EMPTY_DOWNLOAD },
	};
};

export const Studio = () => {
	const [jobs, setJobs] = useState<ImageJob[]>([]);
	const [background, setBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
	const [exportConfig, setExportConfig] = useState<ExportConfig>(DEFAULT_EXPORT);
	const [processing, setProcessing] = useState<ProcessingConfig>(DEFAULT_PROCESSING);
	const [modelDownloads, setModelDownloads] = useState<Record<ModelQuality, ModelDownloadState>>(initialDownloads);
	const [zipping, setZipping] = useState(false);
	const [openingProject, setOpeningProject] = useState(false);
	const [editingJobId, setEditingJobId] = useState<string>();
	const busyRef = useRef(false);
	const progressStampRef = useRef<{ id: string; updatedAt: number } | undefined>(undefined);

	// Persist only the user's preferences, never their images.
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(SETTINGS_KEY) ?? window.localStorage.getItem(LEGACY_SETTINGS_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (parsed.background) setBackground({ ...DEFAULT_BACKGROUND, ...parsed.background });
			if (parsed.exportConfig) setExportConfig({ ...DEFAULT_EXPORT, ...parsed.exportConfig });
			if (parsed.processing) setProcessing({ ...DEFAULT_PROCESSING, ...parsed.processing });
			else if (parsed.model) setProcessing({ ...DEFAULT_PROCESSING, model: parsed.model });
		} catch {
			// ignore malformed settings
		}
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ background, exportConfig, processing }));
		} catch {
			// Storage can be unavailable (e.g. private browsing); preferences
			// are optional and must never take the app down with them.
		}
	}, [background, exportConfig, processing]);

	useEffect(() => {
		const handlePopState = (event: PopStateEvent) => {
			const state = event.state && typeof event.state === "object" ? (event.state as Record<string, unknown>) : undefined;
			setEditingJobId(typeof state?.[EDITOR_HISTORY_KEY] === "string" ? state[EDITOR_HISTORY_KEY] : undefined);
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	const patchJob = useCallback((id: string, patch: Partial<ImageJob>) => {
		setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
	}, []);

	const addFiles = useCallback((files: File[]) => {
		setJobs((current) => {
			const room = MAX_FILES - current.length;
			if (room <= 0) {
				toast.error(`You can queue up to ${MAX_FILES} images at once.`);
				return current;
			}
			const withinSizeLimit = files.filter((file) => file.size <= MAX_FILE_BYTES);
			const skippedOversized = withinSizeLimit.length < files.length;
			const accepted = withinSizeLimit.slice(0, room);
			if (skippedOversized) {
				toast.warning("Some images were too large to process on this device and were skipped.");
			} else if (accepted.length < files.length) {
				toast.warning(`Only the first ${accepted.length} image(s) were added.`);
			}
			const next: ImageJob[] = [];
			for (const file of accepted) {
				const originalUrl = safeObjectUrl(file);
				if (!originalUrl) {
					toast.error(`Could not load ${file.name || "image"} because the device ran out of memory.`);
					continue;
				}
				next.push({
					id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
					file,
					name: file.name || "pasted-image.png",
					size: file.size,
					originalUrl,
					status: "queued",
					progress: 0,
				});
			}
			return [...current, ...next];
		});
	}, []);

	// Sequential worker: one image at a time keeps phones responsive.
	useEffect(() => {
		if (busyRef.current) return;
		const next = jobs.find((job) => job.status === "queued");
		if (!next) return;

		busyRef.current = true;
		const startedAt = performance.now();
		progressStampRef.current = { id: next.id, updatedAt: startedAt };
		patchJob(next.id, { status: "processing", progress: 0, stage: "Preparing" });

		const precisionRequested = Boolean(next.requestedProcessing);
		const settings = next.requestedProcessing ? { ...next.requestedProcessing } : { ...processing };
		patchJob(next.id, { processing: settings, requestedProcessing: undefined, manuallyEdited: false });

		removeImageBackground(next.file, {
			...settings,
			onProgress: (fraction, stage) => {
				progressStampRef.current = { id: next.id, updatedAt: performance.now() };
				patchJob(next.id, { progress: fraction, stage });
			},
		})
			.then(async (blob) => {
				const cutoutUrl = URL.createObjectURL(blob);
				const img = await loadImage(cutoutUrl);
				patchJob(next.id, {
					status: "done",
					progress: 1,
					stage: "Done",
					cutoutUrl,
					width: img.naturalWidth,
					height: img.naturalHeight,
					duration: performance.now() - startedAt,
					aiImproved: precisionRequested,
				});
				setModelDownloads((current) => ({
					...current,
					[settings.model]: { status: "ready", progress: 1, stage: "Ready" },
				}));
			})
			.catch((error: unknown) => {
				patchJob(next.id, {
					status: "error",
					error: error instanceof Error ? error.message : "Background removal failed",
				});
				toast.error(`Could not process ${next.name}`);
			})
			.finally(() => {
				busyRef.current = false;
				progressStampRef.current = undefined;
				// Nudge the effect so the next queued job starts.
				setJobs((current) => [...current]);
			});
	}, [jobs, patchJob, processing]);

	// Watchdog: if a job stops reporting progress (hung worker or wedged
	// WebGPU context), fail it explicitly instead of spinning forever.
	useEffect(() => {
		const timer = window.setInterval(() => {
			const stamp = progressStampRef.current;
			if (!stamp) return;
			const active = jobs.find((job) => job.id === stamp.id && job.status === "processing");
			if (!active || performance.now() - stamp.updatedAt <= STALE_JOB_TIMEOUT_MS) return;
			progressStampRef.current = undefined;
			busyRef.current = false;
			patchJob(stamp.id, {
				status: "error",
				error: "Processing stalled on this device. Tap Retry, or switch the processor to CPU in AI processing.",
			});
			toast.error(`Processing of ${active.name} stalled`);
		}, WATCHDOG_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [jobs, patchJob]);

	const handlePrepareModel = useCallback(
		async (model: ModelQuality) => {
			const device = processing.device;
			setModelDownloads((current) => ({
				...current,
				[model]: { status: "downloading", progress: 0, stage: "Starting download" },
			}));
			try {
				await preloadBackgroundModel({
					model,
					device,
					onProgress: (progress, stage) => {
						setModelDownloads((current) => ({
							...current,
							[model]: { status: "downloading", progress, stage },
						}));
					},
				});
				setModelDownloads((current) => ({
					...current,
					[model]: { status: "ready", progress: 1, stage: "Ready" },
				}));
				toast.success("Model prepared for offline processing");
			} catch (error) {
				setModelDownloads((current) => ({
					...current,
					[model]: { status: "error", progress: 0, stage: "Preparation failed" },
				}));
				toast.error(error instanceof Error ? error.message : "Could not prepare the model");
			}
		},
		[processing.device],
	);

	const backgroundCss = useMemo(() => backgroundToCss(background), [background]);
	const doneJobs = useMemo(() => jobs.filter((job) => job.status === "done"), [jobs]);
	const editingJob = useMemo(() => jobs.find((job) => job.id === editingJobId && job.status === "done" && job.cutoutUrl), [editingJobId, jobs]);
	const pending = jobs.filter((job) => job.status === "queued" || job.status === "processing").length;
	const failed = jobs.filter((job) => job.status === "error").length;
	const activelyProcessing = jobs.some((job) => job.status === "processing");
	const modelPreparing = Object.values(modelDownloads).some((entry) => entry.status === "downloading");
	const openEditor = useCallback((id: string) => {
		const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
		window.history.pushState({ ...currentState, [EDITOR_HISTORY_KEY]: id }, "");
		setEditingJobId(id);
	}, []);

	const handleDownloadImage = useCallback(
		async (job: ImageJob) => {
			try {
				const blob = await renderJob(job, background, exportConfig);
				triggerDownload(blob, outputFileName(job.name, exportConfig.format));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Download failed");
			}
		},
		[background, exportConfig],
	);

	const handleDownloadProject = useCallback(async (job: ImageJob) => {
		try {
			triggerDownload(await createProjectForJob(job), cutoutProjectFileName(job.name));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not save the .cutout project");
		}
	}, []);

	const handleDownloadAll = useCallback(async () => {
		if (!doneJobs.length) return;
		setZipping(true);
		try {
			const { default: JSZip } = await import("jszip");
			const zip = new JSZip();
			const used = new Set<string>();
			for (const job of doneJobs) {
				const blob = exportConfig.downloadKind === "project" ? await createProjectForJob(job) : await renderJob(job, background, exportConfig);
				let name = exportConfig.downloadKind === "project" ? cutoutProjectFileName(job.name) : outputFileName(job.name, exportConfig.format);
				let counter = 2;
				while (used.has(name)) {
					const numberedName = `${job.name.replace(/\.[^./\\]+$/, "")}-${counter}`;
					name = exportConfig.downloadKind === "project" ? cutoutProjectFileName(numberedName) : outputFileName(numberedName, exportConfig.format);
					counter += 1;
				}
				used.add(name);
				zip.file(name, new Uint8Array(await blob.arrayBuffer()));
			}
			const archive = await zip.generateAsync({ type: "blob" });
			triggerDownload(archive, `cutout-studio-${new Date().toISOString().slice(0, 10)}.zip`);
			toast.success(`${doneJobs.length} image(s) exported`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not build the archive");
		} finally {
			setZipping(false);
		}
	}, [background, doneJobs, exportConfig]);

	const handleEdit = useCallback((job: ImageJob) => openEditor(job.id), [openEditor]);

	const handleOpenProject = useCallback(
		async (file: File) => {
			if (jobs.length >= MAX_FILES) {
				toast.error(`You can keep up to ${MAX_FILES} images in the workspace.`);
				return;
			}
			if (file.size > MAX_CUTOUT_PROJECT_BYTES) {
				toast.error("This .cutout project is too large to open on this device.");
				return;
			}

			setOpeningProject(true);
			let originalUrl: string | undefined;
			let cutoutUrl: string | undefined;
			try {
				const project = await readCutoutProject(file);
				const originalFile = new File([project.original], project.originalName, { type: project.original.type });
				originalUrl = safeObjectUrl(originalFile);
				cutoutUrl = safeObjectUrl(project.edited);
				if (!originalUrl || !cutoutUrl) throw new Error("The device could not allocate the project images");
				const [originalImage, editedImage] = await Promise.all([loadImage(originalUrl), loadImage(cutoutUrl)]);
				if (!imageMatchesCanvasAspectRatio(editedImage.naturalWidth, editedImage.naturalHeight, originalImage.naturalWidth, originalImage.naturalHeight)) {
					throw new Error("The original and edited images in this .cutout project do not match");
				}

				const id = `${project.originalName}-${originalFile.size}-${crypto.randomUUID()}`;
				const restoredJob: ImageJob = {
					id,
					file: originalFile,
					name: project.originalName,
					size: originalFile.size,
					originalUrl,
					cutoutUrl,
					width: originalImage.naturalWidth,
					height: originalImage.naturalHeight,
					status: "done",
					progress: 1,
					stage: "Project restored",
					manuallyEdited: true,
				};
				setJobs((current) => [...current, restoredJob]);
				openEditor(id);
				originalUrl = undefined;
				cutoutUrl = undefined;
				toast.success(".cutout project opened");
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Could not open the .cutout project");
			} finally {
				if (originalUrl) URL.revokeObjectURL(originalUrl);
				if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
				setOpeningProject(false);
			}
		},
		[jobs.length, openEditor],
	);

	useEffect(() => {
		type LaunchFileHandle = { getFile: () => Promise<File> };
		type LaunchQueue = { setConsumer: (consumer: (params: { files?: readonly LaunchFileHandle[] }) => void) => void };
		const launchQueue = (window as typeof window & { launchQueue?: LaunchQueue }).launchQueue;
		if (!launchQueue) return;
		let active = true;
		launchQueue.setConsumer((params) => {
			const handle = params.files?.[0];
			if (!handle) return;
			void handle
				.getFile()
				.then((file) => {
					if (active) void handleOpenProject(file);
				})
				.catch(() => {
					if (active) toast.error("Could not read the selected .cutout project");
				});
		});
		return () => {
			active = false;
		};
	}, [handleOpenProject]);

	const handleCloseEditor = useCallback(() => {
		const state = window.history.state && typeof window.history.state === "object" ? (window.history.state as Record<string, unknown>) : undefined;
		if (typeof state?.[EDITOR_HISTORY_KEY] === "string") window.history.back();
		else setEditingJobId(undefined);
	}, []);

	const handleSaveRefinement = useCallback(
		(id: string, blob: Blob) => {
			const cutoutUrl = safeObjectUrl(blob);
			if (!cutoutUrl) {
				toast.error("Could not save the refinement because the device ran out of memory.");
				return;
			}
			setJobs((current) => {
				if (!current.some((job) => job.id === id)) {
					URL.revokeObjectURL(cutoutUrl);
					return current;
				}
				return current.map((job) => {
					if (job.id !== id) return job;
					if (job.cutoutUrl) URL.revokeObjectURL(job.cutoutUrl);
					return { ...job, cutoutUrl, manuallyEdited: true };
				});
			});
			handleCloseEditor();
			toast.success("Manual refinement saved");
		},
		[handleCloseEditor],
	);

	const handleImprove = useCallback(
		(id: string) => {
			setJobs((current) =>
				current.map((job) => {
					if (job.id !== id) return job;
					if (job.cutoutUrl) URL.revokeObjectURL(job.cutoutUrl);
					return {
						...job,
						status: "queued",
						progress: 0,
						stage: "Queued for AI Precision",
						error: undefined,
						cutoutUrl: undefined,
						duration: undefined,
						processing: undefined,
						manuallyEdited: false,
						aiImproved: false,
						requestedProcessing: precisionProcessingConfig(processing.device),
					};
				}),
			);
			handleCloseEditor();
			toast.message("AI Precision queued", { description: "Using the full 32-bit model with sharpened hair and fine edges." });
		},
		[handleCloseEditor, processing.device],
	);

	const handleRemove = useCallback((id: string) => {
		setEditingJobId((current) => (current === id ? undefined : current));
		setJobs((current) => {
			const target = current.find((job) => job.id === id);
			if (target) {
				URL.revokeObjectURL(target.originalUrl);
				if (target.cutoutUrl) URL.revokeObjectURL(target.cutoutUrl);
			}
			return current.filter((job) => job.id !== id);
		});
	}, []);

	const handleRetry = useCallback((id: string) => {
		setJobs((current) =>
			current.map((job) => {
				if (job.id !== id) return job;
				if (job.cutoutUrl) URL.revokeObjectURL(job.cutoutUrl);
				return {
					...job,
					status: "queued",
					progress: 0,
					error: undefined,
					stage: undefined,
					cutoutUrl: undefined,
					duration: undefined,
					processing: undefined,
					requestedProcessing: undefined,
					manuallyEdited: false,
					aiImproved: false,
				};
			}),
		);
	}, []);

	const handleClearAll = useCallback(() => {
		setEditingJobId(undefined);
		setJobs((current) => {
			for (const job of current) {
				URL.revokeObjectURL(job.originalUrl);
				if (job.cutoutUrl) URL.revokeObjectURL(job.cutoutUrl);
			}
			return [];
		});
	}, []);

	if (editingJob) {
		return <MaskEditor job={editingJob} onClose={handleCloseEditor} onImprove={handleImprove} onSave={handleSaveRefinement} />;
	}

	return (
		<div className="min-h-dvh overflow-x-hidden bg-background">
			<header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
				<div className="mx-auto flex max-w-360 items-center gap-3 px-4 py-3 sm:px-6">
					<div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
						<Layers className="size-4.5" aria-hidden="true" />
					</div>
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-bold leading-tight tracking-tight">cutout-studio</span>
						<span className="hidden text-xs leading-tight text-muted-foreground sm:block">Private AI background removal</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<Badge variant="outline" className="hidden gap-1.5 border-primary/20 bg-primary/5 text-primary md:inline-flex">
							<ShieldCheck className="size-3" aria-hidden="true" />
							Runs locally
						</Badge>
						{jobs.length ? (
							<Badge variant="secondary" className="hidden sm:inline-flex">
								{doneJobs.length}/{jobs.length} ready
							</Badge>
						) : null}
						<ThemeToggle />
					</div>
				</div>
			</header>

			<div className="relative isolate">
				<div className="studio-hero pointer-events-none absolute inset-x-0 top-0 -z-10 h-144" aria-hidden="true" />

				<section className="relative">
					<div className="relative mx-auto grid w-full min-w-0 max-w-360 gap-6 px-4 pb-8 pt-9 sm:px-6 sm:pb-10 sm:pt-12 lg:grid-cols-[1fr_auto] lg:items-end">
						<div className="min-w-0 max-w-3xl">
							<Badge variant="outline" className="mb-3 border-primary/20 bg-background/70 backdrop-blur">
								<WandSparkles className="size-3" aria-hidden="true" />
								Local AI workspace
							</Badge>
							<h1 className="wrap-break-word text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Clean cutouts, tuned to every edge.</h1>
							<p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
								Choose the model, edge treatment, and processor. Batch-remove backgrounds without uploading a single image.
							</p>
						</div>
						<div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
							{[
								["3", "AI models"],
								["5", "edge modes"],
								["100%", "on-device"],
							].map(([value, label]) => (
								<div key={label} className="min-w-0 rounded-xl border border-border/70 bg-background/70 px-2.5 py-2.5 backdrop-blur sm:min-w-24 sm:px-3">
									<p className="text-sm font-bold text-primary">{value}</p>
									<p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<main className="relative mx-auto flex w-full min-w-0 max-w-360 flex-col gap-6 px-4 pb-10 sm:px-6 lg:flex-row lg:items-start">
					{/* Controls */}
					<aside className="flex w-full min-w-0 flex-col gap-5 lg:sticky lg:top-20 lg:w-100 lg:shrink-0">
						<Uploader onFiles={addFiles} onProject={handleOpenProject} disabled={modelPreparing || openingProject} />

						<Card className="overflow-hidden border-primary/15 shadow-sm">
							<CardHeader className="border-b border-border/60 bg-muted/20">
								<div className="flex items-center gap-2">
									<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<Sparkles className="size-4" aria-hidden="true" />
									</span>
									<div>
										<CardTitle className="text-sm">AI processing</CardTitle>
										<CardDescription>Controls apply to newly processed images.</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-5">
								<ProcessingOptions
									value={processing}
									onChange={setProcessing}
									downloads={modelDownloads}
									onPrepareModel={handlePrepareModel}
									disabled={activelyProcessing || modelPreparing}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Background</CardTitle>
								<CardDescription>Pick a preset, type a hex code, or blend two colors.</CardDescription>
							</CardHeader>
							<CardContent>
								<BackgroundPicker value={background} onChange={setBackground} />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Export</CardTitle>
								<CardDescription>Choose a ready-to-use image or a project you can reopen later.</CardDescription>
							</CardHeader>
							<CardContent>
								<ExportOptions value={exportConfig} onChange={setExportConfig} />
							</CardContent>
						</Card>

						{exportConfig.downloadKind === "image" && background.kind === "transparent" && exportConfig.format === "image/jpeg" ? (
							<Alert>
								<AlertTitle>JPG has no transparency</AlertTitle>
								<AlertDescription>Transparent areas will be filled with white on export.</AlertDescription>
							</Alert>
						) : null}
					</aside>

					{/* Results */}
					<section className="flex min-w-0 flex-1 flex-col gap-6">
						{jobs.length === 0 ? (
							<Empty className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-6 py-16 shadow-sm">
								<div className="pointer-events-none absolute inset-x-16 top-0 h-32 rounded-full bg-primary/10 blur-3xl" />
								<EmptyHeader>
									<EmptyMedia variant="icon" className="relative size-14 rounded-2xl bg-primary/10 text-primary">
										<Images aria-hidden="true" />
									</EmptyMedia>
									<EmptyTitle className="text-lg">Your canvas is ready</EmptyTitle>
									<EmptyDescription>
										Drop a product shot, portrait, logo, or a whole batch. Your selected model and edge algorithm will run entirely in this browser.
									</EmptyDescription>
								</EmptyHeader>
								<div className="mt-8 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
									{[
										["01", "Add images", "Drop, browse, paste, or use your camera."],
										["02", "Tune the cutout", "Pick a model, edge mode, and processor."],
										["03", "Export anywhere", "Choose transparency, format, and size."],
									].map(([number, title, description]) => (
										<div key={number} className="rounded-xl border bg-background/70 p-3">
											<span className="font-mono text-[10px] font-bold text-primary">{number}</span>
											<p className="mt-1 text-xs font-semibold">{title}</p>
											<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
										</div>
									))}
								</div>
							</Empty>
						) : (
							<>
								<Card>
									<CardHeader>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="flex flex-col gap-1">
												<CardTitle className="text-sm">Processing queue</CardTitle>
												<CardDescription>
													{doneJobs.length} ready · {pending} in progress
													{failed ? ` · ${failed} failed` : ""}
												</CardDescription>
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<Button size="sm" disabled={!doneJobs.length || zipping} onClick={handleDownloadAll}>
													<FileArchive data-icon="inline-start" aria-hidden="true" />
													{zipping ? "Zipping…" : exportConfig.downloadKind === "project" ? "Download all .cutout" : "Download all images"}
												</Button>
												<Button variant="outline" size="sm" onClick={handleClearAll}>
													<Trash2 data-icon="inline-start" aria-hidden="true" />
													Clear
												</Button>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<Separator className="mb-1" />
										<JobQueue
											jobs={jobs}
											onDownload={handleDownloadImage}
											onDownloadProject={handleDownloadProject}
											onEdit={handleEdit}
											onRetry={handleRetry}
											onRemove={handleRemove}
										/>
									</CardContent>
								</Card>

								<div className="flex items-center justify-between gap-3">
									<h2 className="text-sm font-semibold">Before / after</h2>
									<p className="text-xs text-muted-foreground">Drag the vertical line to reveal each version</p>
								</div>

								<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
									{jobs.map((job) => (
										<JobCard
											key={job.id}
											job={job}
											backgroundCss={backgroundCss}
											onDownload={handleDownloadImage}
											onDownloadProject={handleDownloadProject}
											onEdit={handleEdit}
											onImprove={handleImprove}
											onRetry={handleRetry}
											onRemove={handleRemove}
										/>
									))}
								</div>
							</>
						)}
					</section>
				</main>
			</div>

			<footer className="border-t border-border/60 bg-muted/25">
				<div className="mx-auto w-full max-w-360 px-4 py-8 sm:px-6 sm:py-10">
					<div className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-sm backdrop-blur">
						<div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[1.05fr_1.4fr] lg:items-center">
							<div className="max-w-md">
								<div className="flex items-center gap-3">
									<span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
										<Layers className="size-4.5" aria-hidden="true" />
									</span>
									<div>
										<p className="text-sm font-bold tracking-tight">cutout-studio</p>
										<p className="text-[11px] text-muted-foreground">Your private cutout workspace</p>
									</div>
								</div>
								<h2 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">Fast results. Your images stay yours.</h2>
								<p className="mt-2 text-sm leading-6 text-muted-foreground">
									AI models are cached after their first download, while every image and export remains on your device.
								</p>
							</div>

							<div className="grid gap-2 sm:grid-cols-3">
								{[
									{
										icon: ShieldCheck,
										title: "Private by design",
										description: "Photos never leave this browser.",
									},
									{
										icon: HardDrive,
										title: "Model caching",
										description: "Reuse prepared models on later runs.",
									},
									{
										icon: CloudOff,
										title: "No cloud queue",
										description: "Processing starts directly on your device.",
									},
								].map(({ icon: Icon, title, description }) => (
									<div key={title} className="rounded-xl border border-border/60 bg-background/70 p-3.5">
										<Icon className="size-4 text-primary" aria-hidden="true" />
										<p className="mt-3 text-xs font-semibold">{title}</p>
										<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
									</div>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-7">
							<p>cutout-studio · On-device background removal</p>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
								<a
									href="https://github.com/jorgeadev/cutout-studio"
									target="_blank"
									rel="noreferrer"
									className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
								>
									<CodeXml className="size-3.5" aria-hidden="true" />
									Source and license
								</a>
								<p className="font-mono uppercase tracking-wider">PNG · WebP · JPG · ZIP</p>
							</div>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
};
