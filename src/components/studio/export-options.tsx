import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
		</FieldGroup>
	);
};
