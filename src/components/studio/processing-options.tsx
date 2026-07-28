import { Check, Cpu, Download, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { ALGORITHM_OPTIONS, DEVICE_OPTIONS, MODEL_OPTIONS } from "@/lib/processing-options";
import { cn } from "@/lib/utils";
import type { ProcessingOptionsProps } from "@/types/processing";

export const ProcessingOptions = ({ value, onChange, downloads, onPrepareModel, disabled }: ProcessingOptionsProps) => {
	const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
	const selectedModel = useMemo(() => MODEL_OPTIONS.find((entry) => entry.value === value.model) ?? MODEL_OPTIONS[1], [value.model]);
	const download = downloads[value.model];

	useEffect(() => {
		setWebGpuAvailable("gpu" in navigator);
	}, []);

	return (
		<FieldGroup className="gap-6">
			<Field>
				<div className="flex items-center justify-between gap-3">
					<FieldLabel>AI model</FieldLabel>
					<Badge variant="outline" className="font-mono text-[10px]">
						{selectedModel.size}
					</Badge>
				</div>
				<div className="grid gap-2">
					{MODEL_OPTIONS.map((model) => {
						const active = model.value === value.model;
						const state = downloads[model.value];
						return (
							<button
								key={model.value}
								type="button"
								aria-pressed={active}
								disabled={disabled}
								onClick={() => onChange({ ...value, model: model.value })}
								className={cn(
									"group flex w-full cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
									active ? "border-primary bg-primary/10 shadow-sm hover:border-primary hover:bg-primary/15" : "hover:border-primary/60 hover:bg-[var(--control-hover)]",
								)}
							>
								<span
									className={cn(
										"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors",
										active && "bg-primary text-primary-foreground",
									)}
								>
									{model.value === "isnet_quint8" ? (
										<Zap className="size-4" aria-hidden="true" />
									) : model.value === "isnet" ? (
										<Sparkles className="size-4" aria-hidden="true" />
									) : (
										<Cpu className="size-4" aria-hidden="true" />
									)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="flex flex-wrap items-center gap-1.5">
										<span className="text-sm font-semibold">{model.name}</span>
										<span className="text-[11px] text-muted-foreground">{model.precision}</span>
										{model.recommended ? <Badge className="h-5 px-1.5 text-[9px]">Recommended</Badge> : null}
									</span>
									<span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{model.description}</span>
								</span>
								<span className="mt-1 flex size-4 shrink-0 items-center justify-center">
									{state.status === "ready" ? (
										<Check className="size-4 text-primary" aria-label="Prepared" />
									) : (
										<span className={cn("size-3 rounded-full border", active && "border-4 border-primary")} />
									)}
								</span>
							</button>
						);
					})}
				</div>

				<div className="rounded-lg border border-dashed bg-muted/30 p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="truncate text-xs font-medium">{download.status === "ready" ? `${selectedModel.name} is ready` : `Prepare ${selectedModel.name}`}</p>
							<p className="mt-0.5 text-[11px] text-muted-foreground">
								{download.status === "downloading"
									? (download.stage ?? "Downloading model")
									: download.status === "ready"
										? "Loaded and cached for this browser."
										: download.status === "error"
											? "Preparation failed. You can try again."
											: "Optional — otherwise it downloads with the first image."}
							</p>
						</div>
						<Button
							type="button"
							variant={download.status === "ready" ? "ghost" : "outline"}
							size="sm"
							disabled={disabled || download.status === "downloading" || download.status === "ready"}
							onClick={() => onPrepareModel(value.model)}
						>
							{download.status === "ready" ? <Check data-icon="inline-start" aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
							{download.status === "downloading" ? `${Math.round(download.progress * 100)}%` : "Prepare"}
						</Button>
					</div>
					{download.status === "downloading" ? <Progress value={Math.round(download.progress * 100)} className="mt-3" /> : null}
				</div>
				<FieldDescription>Models stay on this device and are reused for future cutouts.</FieldDescription>
			</Field>

			<Field>
				<FieldLabel>Edge algorithm</FieldLabel>
				<div className="grid grid-cols-2 gap-2">
					{ALGORITHM_OPTIONS.map((algorithm) => {
						const active = algorithm.value === value.algorithm;
						return (
							<button
								key={algorithm.value}
								type="button"
								aria-pressed={active}
								disabled={disabled}
								onClick={() => onChange({ ...value, algorithm: algorithm.value })}
								className={cn(
									"cursor-pointer rounded-lg border bg-background p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
									active ? "border-primary bg-primary/10 hover:border-primary hover:bg-primary/15" : "hover:border-primary/60 hover:bg-[var(--control-hover)]",
								)}
							>
								<span className="flex items-center gap-2 text-xs font-semibold">
									<span className={cn("size-1.5 rounded-full bg-muted-foreground", active && "bg-primary")} />
									{algorithm.name}
								</span>
								<span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">{algorithm.description}</span>
							</button>
						);
					})}
				</div>
			</Field>

			<Field>
				<div className="flex items-center justify-between gap-3">
					<FieldLabel>Processor</FieldLabel>
					{webGpuAvailable !== null ? <span className="text-[10px] font-medium text-muted-foreground">WebGPU {webGpuAvailable ? "detected" : "unavailable"}</span> : null}
				</div>
				<div className="grid grid-cols-3 gap-2">
					{DEVICE_OPTIONS.map((device) => {
						const active = device.value === value.device;
						return (
							<button
								key={device.value}
								type="button"
								title={device.description}
								aria-pressed={active}
								disabled={disabled}
								onClick={() => onChange({ ...value, device: device.value })}
								className={cn(
									"cursor-pointer rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
									active
										? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-[var(--primary-hover)]"
										: "hover:border-primary/60 hover:bg-[var(--control-hover)] hover:text-foreground",
									device.value === "gpu" && webGpuAvailable === false && "opacity-50",
								)}
							>
								{device.name}
							</button>
						);
					})}
				</div>
				<FieldDescription>{DEVICE_OPTIONS.find((entry) => entry.value === value.device)?.description}</FieldDescription>
			</Field>
		</FieldGroup>
	);
};
