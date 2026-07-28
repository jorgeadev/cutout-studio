import { Blend, Check, Grid2x2, Palette } from "lucide-react";
import { useState } from "react";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { backgroundToCss, isValidHex, normalizeHex, readableTextColor } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import type { BackgroundKind, BackgroundPickerProps } from "@/types/background";

const SWATCHES = [
	{ hex: "#ffffff", label: "White" },
	{ hex: "#f5f5f4", label: "Bone" },
	{ hex: "#e7e5e4", label: "Stone" },
	{ hex: "#111827", label: "Ink" },
	{ hex: "#0f766e", label: "Teal" },
	{ hex: "#0ea5e9", label: "Sky" },
	{ hex: "#1d4ed8", label: "Blue" },
	{ hex: "#15803d", label: "Green" },
	{ hex: "#eab308", label: "Amber" },
	{ hex: "#f97316", label: "Orange" },
	{ hex: "#dc2626", label: "Red" },
	{ hex: "#f5d0c5", label: "Blush" },
];

export const BackgroundPicker = ({ value, onChange }: BackgroundPickerProps) => {
	const [hexDraft, setHexDraft] = useState(value.color);
	const [hex2Draft, setHex2Draft] = useState(value.color2);
	const previewCss = backgroundToCss(value);

	const setKind = (kind: BackgroundKind) => {
		onChange({ ...value, kind });
	};

	const commitHex = (raw: string, slot: "color" | "color2", syncDraft = true) => {
		const normalized = normalizeHex(raw);
		if (!isValidHex(normalized)) return;
		onChange({ ...value, [slot]: normalized, kind: value.kind === "transparent" ? "solid" : value.kind });
		if (!syncDraft) return;
		if (slot === "color") setHexDraft(normalized);
		else setHex2Draft(normalized);
	};

	/** Applies the color while typing so the preview tracks each keystroke,
	 *  but leaves the raw text alone so the caret does not jump. */
	const handleHexInput = (raw: string, slot: "color" | "color2") => {
		if (slot === "color") setHexDraft(raw);
		else setHex2Draft(raw);
		commitHex(raw, slot, false);
	};

	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Background</FieldLabel>
				<ToggleGroup
					variant="outline"
					spacing={0}
					className="w-full"
					value={[value.kind]}
					onValueChange={(next) => {
						const kind = (next as string[])[0] as BackgroundKind | undefined;
						if (kind) setKind(kind);
					}}
				>
					<ToggleGroupItem value="transparent" className="flex-1">
						<Grid2x2 data-icon="inline-start" aria-hidden="true" />
						None
					</ToggleGroupItem>
					<ToggleGroupItem value="solid" className="flex-1">
						<Palette data-icon="inline-start" aria-hidden="true" />
						Solid
					</ToggleGroupItem>
					<ToggleGroupItem value="gradient" className="flex-1">
						<Blend data-icon="inline-start" aria-hidden="true" />
						Gradient
					</ToggleGroupItem>
				</ToggleGroup>
				<FieldDescription>
					{value.kind === "transparent" ? "Keeps the alpha channel. Export as PNG or WebP to preserve it." : "Applied live to every processed image."}
				</FieldDescription>
			</Field>

			{value.kind !== "transparent" ? (
				<>
					<Field>
						<FieldLabel>Presets</FieldLabel>
						<div className="grid grid-cols-6 gap-2">
							{SWATCHES.map((swatch) => {
								const active = value.color.toLowerCase() === swatch.hex;
								return (
									<button
										key={swatch.hex}
										type="button"
										title={swatch.label}
										aria-label={swatch.label}
										aria-pressed={active}
										onClick={() => {
											setHexDraft(swatch.hex);
											onChange({ ...value, color: swatch.hex });
										}}
										style={{ backgroundColor: swatch.hex, color: readableTextColor(swatch.hex) }}
										className={cn(
											"flex aspect-square cursor-pointer items-center justify-center rounded-md border border-border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
											active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
										)}
									>
										{active ? <Check className="size-3.5" aria-hidden="true" /> : null}
									</button>
								);
							})}
						</div>
					</Field>

					<Field>
						<FieldLabel htmlFor="hex-primary">{value.kind === "gradient" ? "From (hex)" : "Custom hex"}</FieldLabel>
						<div className="flex items-center gap-2">
							<input
								type="color"
								aria-label="Color picker"
								value={isValidHex(value.color) ? value.color : "#000000"}
								onChange={(event) => {
									setHexDraft(event.target.value);
									onChange({ ...value, color: event.target.value });
								}}
								className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1 transition-colors hover:border-primary"
							/>
							<Input
								id="hex-primary"
								value={hexDraft}
								spellCheck={false}
								placeholder="#0f766e"
								className="font-mono"
								aria-invalid={!isValidHex(normalizeHex(hexDraft)) || undefined}
								onChange={(event) => handleHexInput(event.target.value, "color")}
								onBlur={(event) => commitHex(event.target.value, "color")}
								onKeyDown={(event) => {
									if (event.key === "Enter") commitHex(hexDraft, "color");
								}}
							/>
						</div>
					</Field>

					{value.kind === "gradient" ? (
						<>
							<Field>
								<FieldLabel htmlFor="hex-secondary">To (hex)</FieldLabel>
								<div className="flex items-center gap-2">
									<input
										type="color"
										aria-label="Second color picker"
										value={isValidHex(value.color2) ? value.color2 : "#000000"}
										onChange={(event) => {
											setHex2Draft(event.target.value);
											onChange({ ...value, color2: event.target.value });
										}}
										className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1 transition-colors hover:border-primary"
									/>
									<Input
										id="hex-secondary"
										value={hex2Draft}
										spellCheck={false}
										placeholder="#0ea5e9"
										className="font-mono"
										aria-invalid={!isValidHex(normalizeHex(hex2Draft)) || undefined}
										onChange={(event) => handleHexInput(event.target.value, "color2")}
										onBlur={(event) => commitHex(event.target.value, "color2")}
										onKeyDown={(event) => {
											if (event.key === "Enter") commitHex(hex2Draft, "color2");
										}}
									/>
								</div>
							</Field>

							<Field>
								<FieldLabel htmlFor="angle">
									Angle
									<span className="ml-auto font-mono text-xs text-muted-foreground">{value.angle}°</span>
								</FieldLabel>
								<Slider id="angle" min={0} max={360} step={5} value={value.angle} onValueChange={(next) => onChange({ ...value, angle: Array.isArray(next) ? next[0] : next })} />
							</Field>
						</>
					) : null}
				</>
			) : null}

			<Field>
				<FieldLabel>Preview</FieldLabel>
				<div className={cn("h-16 w-full rounded-lg border border-border", previewCss ? null : "checkerboard")} style={{ background: previewCss ?? undefined }} />
			</Field>
		</FieldGroup>
	);
};
