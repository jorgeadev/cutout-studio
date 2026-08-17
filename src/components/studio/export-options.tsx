import { FileArchive, ImageIcon } from "lucide-react";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ExportOptionsProps, OutputFormat } from "@/types/export";

const FORMATS = [
	{ value: "image/png", label: "PNG · lossless, keeps alpha" },
	{ value: "image/webp", label: "WebP · smaller, keeps alpha" },
	{ value: "image/jpeg", label: "JPG · smallest, no alpha" },
];

const SCALES = [
	{ value: "0.5", label: "50%" },
	{ value: "1", label: "100% · original" },
	{ value: "1.5", label: "150%" },
	{ value: "2", label: "200%" },
];

export const ExportOptions = ({ value, onChange }: ExportOptionsProps) => {
	const lossy = value.format !== "image/png";

	return (
		<FieldGroup>
			<FieldSet className="gap-2">
				<FieldLegend variant="label">Download all as</FieldLegend>
				<div className="grid grid-cols-2 gap-2">
					<button
						type="button"
						aria-pressed={value.downloadKind === "image"}
						className={cn(
							"flex min-h-20 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
							value.downloadKind === "image" ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40",
						)}
						onClick={() => onChange({ ...value, downloadKind: "image" })}
					>
						<span className="flex items-center gap-1.5 text-xs font-semibold">
							<ImageIcon className="size-3.5" aria-hidden="true" />
							Result images
						</span>
						<span className="text-[10px] leading-snug">PNG, WebP, or JPG</span>
					</button>
					<button
						type="button"
						aria-pressed={value.downloadKind === "project"}
						className={cn(
							"flex min-h-20 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
							value.downloadKind === "project" ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40",
						)}
						onClick={() => onChange({ ...value, downloadKind: "project" })}
					>
						<span className="flex items-center gap-1.5 text-xs font-semibold">
							<FileArchive className="size-3.5" aria-hidden="true" />
							Editable .cutout
						</span>
						<span className="text-[10px] leading-snug">Original + refined result</span>
					</button>
				</div>
			</FieldSet>

			{value.downloadKind === "project" ? (
				<p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
					Includes the original and transparent refined result in one <strong className="font-semibold text-foreground">.cutout</strong> file. Open it later to continue editing.
				</p>
			) : (
				<>
					<Field>
						<FieldLabel htmlFor="format">File format</FieldLabel>
						<Select items={FORMATS} value={value.format} onValueChange={(next) => onChange({ ...value, format: next as OutputFormat })}>
							<SelectTrigger id="format" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{FORMATS.map((format) => (
										<SelectItem key={format.value} value={format.value}>
											{format.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>

					<Field>
						<FieldLabel htmlFor="scale">Output size</FieldLabel>
						<Select items={SCALES} value={String(value.scale)} onValueChange={(next) => onChange({ ...value, scale: Number(next as string) })}>
							<SelectTrigger id="scale" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{SCALES.map((scale) => (
										<SelectItem key={scale.value} value={scale.value}>
											{scale.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>

					{lossy ? (
						<Field>
							<FieldLabel htmlFor="quality">
								Quality
								<span className="ml-auto font-mono text-xs text-muted-foreground">{Math.round(value.quality * 100)}%</span>
							</FieldLabel>
							<Slider
								id="quality"
								min={40}
								max={100}
								step={1}
								value={Math.round(value.quality * 100)}
								onValueChange={(next) => onChange({ ...value, quality: (Array.isArray(next) ? next[0] : next) / 100 })}
							/>
						</Field>
					) : null}
				</>
			)}
		</FieldGroup>
	);
};
