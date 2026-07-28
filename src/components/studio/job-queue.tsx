import { Download, RotateCcw, X } from "lucide-react";
import { StatusBadge } from "@/components/studio/job-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/image-utils";
import type { JobQueueProps } from "@/types/job";

export const JobQueue = ({ jobs, onDownload, onRetry, onRemove }: JobQueueProps) => {
	return (
		<ul className="flex max-h-104 flex-col divide-y divide-border overflow-y-auto pr-1">
			{jobs.map((job) => (
				<li key={job.id} className="flex items-center gap-3 py-3">
					<div className="checkerboard size-11 shrink-0 overflow-hidden rounded-lg border border-border">
						<img src={(job.status === "done" ? job.cutoutUrl : job.originalUrl) || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
					</div>

					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<p className="truncate text-sm font-medium" title={job.name}>
							{job.name}
						</p>
						{job.status === "processing" ? (
							<div className="flex items-center gap-2">
								<Progress value={Math.round(job.progress * 100)} className="max-w-40" />
								<span className="truncate text-xs text-muted-foreground">{job.stage}</span>
							</div>
						) : (
							<p className="truncate text-xs text-muted-foreground">
								{job.status === "error" ? (job.error ?? "Failed") : `${formatBytes(job.size)}${job.width ? ` · ${job.width} × ${job.height}` : ""}`}
							</p>
						)}
					</div>

					<StatusBadge job={job} />

					<div className="flex items-center gap-0.5">
						{job.status === "error" || job.status === "done" ? (
							<Button variant="ghost" size="icon-sm" aria-label={`${job.status === "done" ? "Reprocess" : "Retry"} ${job.name}`} onClick={() => onRetry(job.id)}>
								<RotateCcw aria-hidden="true" />
							</Button>
						) : null}
						<Button variant="ghost" size="icon-sm" aria-label={`Download ${job.name}`} disabled={job.status !== "done"} onClick={() => onDownload(job)}>
							<Download aria-hidden="true" />
						</Button>
						<Button variant="ghost" size="icon-sm" aria-label={`Remove ${job.name}`} onClick={() => onRemove(job.id)}>
							<X aria-hidden="true" />
						</Button>
					</div>
				</li>
			))}
		</ul>
	);
};
