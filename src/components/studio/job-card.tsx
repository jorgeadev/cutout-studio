import { AlertTriangle, Download, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { CompareSlider } from "@/components/studio/compare-slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/image-utils";
import { ALGORITHM_OPTIONS, MODEL_OPTIONS } from "@/lib/processing-options";
import type { JobCardProps, StatusBadgeProps } from "@/types/job";

export const JobCard = ({ job, backgroundCss, onDownload, onRetry, onRemove }: JobCardProps) => {
	const model = MODEL_OPTIONS.find((entry) => entry.value === job.processing?.model);
	const algorithm = ALGORITHM_OPTIONS.find((entry) => entry.value === job.processing?.algorithm);

	return (
		<Card className="group overflow-hidden border-border/70 shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md">
			<CardHeader className="gap-2 border-b border-border/50 bg-muted/10">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="truncate text-sm font-semibold" title={job.name}>
							{job.name}
						</CardTitle>
						<p className="mt-1 text-xs text-muted-foreground">
							{formatBytes(job.size)}
							{job.width ? ` · ${job.width} × ${job.height}` : ""}
							{job.duration ? ` · ${(job.duration / 1000).toFixed(1)}s` : ""}
						</p>
					</div>
					<StatusBadge job={job} />
				</div>
				{model || algorithm ? (
					<div className="flex flex-wrap gap-1.5">
						{model ? (
							<Badge variant="outline" className="h-5 gap-1 px-1.5 text-[9px] font-medium">
								<Sparkles className="size-2.5" aria-hidden="true" />
								{model.name}
							</Badge>
						) : null}
						{algorithm ? (
							<Badge variant="outline" className="h-5 px-1.5 text-[9px] font-medium">
								{algorithm.name}
							</Badge>
						) : null}
						{job.processing ? (
							<Badge variant="outline" className="h-5 px-1.5 text-[9px] font-medium uppercase">
								{job.processing.device}
							</Badge>
						) : null}
					</div>
				) : null}
			</CardHeader>

			<CardContent className="pt-4">
				{job.status === "done" && job.cutoutUrl ? (
					<CompareSlider originalUrl={job.originalUrl} cutoutUrl={job.cutoutUrl} backgroundCss={backgroundCss} alt={job.name} className="aspect-4/3 w-full" />
				) : job.status === "error" ? (
					<div className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 p-4 text-center">
						<AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
						<p className="text-xs leading-relaxed text-muted-foreground">{job.error ?? "Something went wrong"}</p>
					</div>
				) : (
					<div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-border bg-muted">
						<img src={job.originalUrl || "/placeholder.svg"} alt={job.name} className="h-full w-full object-contain opacity-35 blur-[1px]" />
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/20 p-4 backdrop-blur-[2px]">
							<span className="flex size-10 items-center justify-center rounded-full bg-background shadow-sm">
								<Spinner />
							</span>
							<p className="text-xs font-semibold">{job.stage ?? "Queued"}</p>
							{job.status === "processing" ? <Progress value={Math.round(job.progress * 100)} className="w-3/4 max-w-56" /> : null}
						</div>
					</div>
				)}
			</CardContent>

			<CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border/50 bg-muted/10">
				{job.status === "error" ? (
					<Button variant="outline" size="sm" onClick={() => onRetry(job.id)}>
						<RotateCcw data-icon="inline-start" aria-hidden="true" />
						Retry
					</Button>
				) : null}
				{job.status === "done" ? (
					<Button variant="outline" size="sm" onClick={() => onRetry(job.id)}>
						<RotateCcw data-icon="inline-start" aria-hidden="true" />
						Reprocess
					</Button>
				) : null}
				<Button size="sm" disabled={job.status !== "done"} onClick={() => onDownload(job)}>
					<Download data-icon="inline-start" aria-hidden="true" />
					Download
				</Button>
				<Button variant="ghost" size="icon-sm" aria-label={`Remove ${job.name}`} onClick={() => onRemove(job.id)}>
					<Trash2 aria-hidden="true" />
				</Button>
			</CardFooter>
		</Card>
	);
};

export const StatusBadge = ({ job }: StatusBadgeProps) => {
	if (job.status === "done") return <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">Ready</Badge>;
	if (job.status === "error") return <Badge variant="destructive">Failed</Badge>;
	if (job.status === "processing") return <Badge variant="outline">{Math.round(job.progress * 100)}%</Badge>;
	return <Badge variant="outline">Queued</Badge>;
};
