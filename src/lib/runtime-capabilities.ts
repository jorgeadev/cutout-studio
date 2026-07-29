import type { ProcessingDevice, WebGpuNavigator } from "@/types/processing";

let adapterAvailability: Promise<boolean> | undefined;

const probeWebGpuAdapter = async (): Promise<boolean> => {
	if (typeof navigator === "undefined") return false;
	const gpu = (navigator as unknown as WebGpuNavigator).gpu;
	if (!gpu) return false;
	try {
		return Boolean(await gpu.requestAdapter());
	} catch {
		return false;
	}
};

export const hasWebGpuAdapter = (): Promise<boolean> => {
	adapterAvailability ??= probeWebGpuAdapter();
	return adapterAvailability;
};

export const resolveProcessingDevice = async (device: ProcessingDevice): Promise<"cpu" | "gpu"> => {
	if (device !== "auto") return device;
	return (await hasWebGpuAdapter()) ? "gpu" : "cpu";
};
