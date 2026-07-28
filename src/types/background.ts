export type BackgroundKind = "transparent" | "solid" | "gradient";

export interface BackgroundConfig {
	kind: BackgroundKind;
	color: string;
	color2: string;
	/** CSS gradient angle in degrees (0 = to top). */
	angle: number;
}

export interface BackgroundPickerProps {
	value: BackgroundConfig;
	onChange: (next: BackgroundConfig) => void;
}
