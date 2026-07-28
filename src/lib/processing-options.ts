import type { AlgorithmOption, DeviceOption, ModelOption } from "@/types/processing";

export const MODEL_OPTIONS: ModelOption[] = [
	{
		value: "isnet_quint8",
		name: "Swift",
		precision: "8-bit",
		size: "~42 MB",
		description: "Fastest first run and the lightest download. Best for drafts and large batches.",
	},
	{
		value: "isnet_fp16",
		name: "Studio",
		precision: "16-bit",
		size: "~84 MB",
		description: "Strong detail with half the full model size. The best default for most images.",
		recommended: true,
	},
	{
		value: "isnet",
		name: "Max",
		precision: "32-bit",
		size: "~168 MB",
		description: "Full-precision mask for difficult edges when download size matters less.",
	},
];

export const ALGORITHM_OPTIONS: AlgorithmOption[] = [
	{
		value: "natural",
		name: "Natural matte",
		description: "Keeps the neural network's original transparency values.",
	},
	{
		value: "refine",
		name: "Edge refine",
		description: "Tightens semi-transparent edges and reduces pale halos.",
	},
	{
		value: "soft",
		name: "Soft detail",
		description: "Adds a light alpha feather for portraits, hair, and fur.",
	},
	{
		value: "hard",
		name: "Hard edge",
		description: "Creates an opaque binary cutout for logos and solid products.",
	},
];

export const DEVICE_OPTIONS: DeviceOption[] = [
	{ value: "auto", name: "Auto", description: "Use WebGPU when available, otherwise CPU." },
	{ value: "gpu", name: "WebGPU", description: "Prefer graphics acceleration on supported browsers." },
	{ value: "cpu", name: "CPU", description: "Use cross-origin-isolated WASM threads." },
];
