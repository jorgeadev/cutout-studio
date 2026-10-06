import ortWasmSimdThreadedJsepModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmSimdThreadedJsepUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import ortWasmSimdThreadedModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasmSimdThreadedUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { loadModelBytes } from "@/lib/model-cache";
import { MODEL_INPUT_NAME, MODEL_INPUT_SIZE, MODEL_OUTPUT_NAME } from "@/lib/model-registry";
import type { ModelQuality } from "@/types/processing";

type OrtModule = typeof import("onnxruntime-web");

export interface SegmentationSession {
	inputSize: number;
	run: (input: Float32Array) => Promise<Float32Array>;
}

let cpuOrt: Promise<OrtModule> | undefined;
let gpuOrt: Promise<OrtModule> | undefined;
const sessions = new Map<string, Promise<SegmentationSession>>();

/** The WebGPU entry point ships its own JSEP WASM build; CPU uses the plain one. */
const loadOrt = (useWebGpu: boolean): Promise<OrtModule> => {
	if (useWebGpu) {
		gpuOrt ??= import("onnxruntime-web/webgpu").catch((error: unknown) => {
			gpuOrt = undefined;
			throw error;
		});
		return gpuOrt;
	}
	cpuOrt ??= import("onnxruntime-web").catch((error: unknown) => {
		cpuOrt = undefined;
		throw error;
	});
	return cpuOrt;
};

const configureOrt = (ort: OrtModule, useWebGpu: boolean): void => {
	const hardwareConcurrency = typeof navigator === "undefined" ? 1 : (navigator.hardwareConcurrency ?? 4);
	ort.env.wasm.numThreads = Math.max(1, hardwareConcurrency);
	ort.env.wasm.proxy = false;
	ort.env.wasm.wasmPaths = useWebGpu
		? { mjs: ortWasmSimdThreadedJsepModuleUrl, wasm: ortWasmSimdThreadedJsepUrl }
		: { mjs: ortWasmSimdThreadedModuleUrl, wasm: ortWasmSimdThreadedUrl };
	ort.env.logLevel = "error";
};

const createSegmentationSession = async (model: ModelQuality, device: "cpu" | "gpu", onModelProgress?: (fraction: number) => void): Promise<SegmentationSession> => {
	const useWebGpu = device === "gpu";
	const ort = await loadOrt(useWebGpu);
	configureOrt(ort, useWebGpu);
	const bytes = await loadModelBytes(model, { onProgress: onModelProgress });
	const session = await ort.InferenceSession.create(bytes, {
		executionProviders: useWebGpu ? ["webgpu"] : ["wasm"],
		graphOptimizationLevel: "all",
		executionMode: "parallel",
	});
	return {
		inputSize: MODEL_INPUT_SIZE,
		run: async (input: Float32Array): Promise<Float32Array> => {
			const tensor = new ort.Tensor("float32", input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
			const outputs = await session.run({ [MODEL_INPUT_NAME]: tensor });
			const output = outputs[MODEL_OUTPUT_NAME];
			if (!output) throw new Error("The segmentation model did not return an alpha mask");
			return output.data as Float32Array;
		},
	};
};

/** Creates one live ONNX session per model and device, reusing failed promises never. */
export const getSegmentationSession = (model: ModelQuality, device: "cpu" | "gpu", onModelProgress?: (fraction: number) => void): Promise<SegmentationSession> => {
	const key = `${model}:${device}`;
	const cached = sessions.get(key);
	if (cached) return cached;
	const promise = createSegmentationSession(model, device, onModelProgress).catch((error: unknown) => {
		sessions.delete(key);
		throw error;
	});
	sessions.set(key, promise);
	return promise;
};
