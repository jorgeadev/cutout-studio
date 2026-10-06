import { beforeEach, describe, expect, it, vi } from "vitest";
import ortWasmSimdThreadedJsepModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmSimdThreadedJsepUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import ortWasmSimdThreadedModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasmSimdThreadedUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

const ortMocks = vi.hoisted(() => {
	class Tensor {
		constructor(
			public type: string,
			public data: Float32Array,
			public dims: number[],
		) {}
	}

	const create = vi.fn();
	const env = {
		logLevel: "warning",
		wasm: { numThreads: 0, proxy: true, wasmPaths: undefined as unknown },
	};
	return { Tensor, create, env };
});

const modelCacheMocks = vi.hoisted(() => ({
	loadModelBytes: vi.fn(),
}));

vi.mock("onnxruntime-web", () => ({ InferenceSession: { create: ortMocks.create }, Tensor: ortMocks.Tensor, env: ortMocks.env }));
vi.mock("onnxruntime-web/webgpu", () => ({ InferenceSession: { create: ortMocks.create }, Tensor: ortMocks.Tensor, env: ortMocks.env }));
vi.mock("@/lib/model-cache", () => modelCacheMocks);

let runtime: typeof import("@/lib/onnx-runtime");

beforeEach(async () => {
	vi.resetModules();
	ortMocks.create.mockReset();
	ortMocks.create.mockResolvedValue({ run: vi.fn(async () => ({ output: { data: new Float32Array([0.5]) } })) });
	ortMocks.env.logLevel = "warning";
	ortMocks.env.wasm.numThreads = 0;
	ortMocks.env.wasm.proxy = true;
	ortMocks.env.wasm.wasmPaths = undefined;
	modelCacheMocks.loadModelBytes.mockReset();
	modelCacheMocks.loadModelBytes.mockResolvedValue(new ArrayBuffer(8));
	runtime = await import("@/lib/onnx-runtime");
});

describe("segmentation sessions", () => {
	it("creates one cached CPU session with the plain WASM runtime", async () => {
		const first = await runtime.getSegmentationSession("isnet_quint8", "cpu");
		const second = await runtime.getSegmentationSession("isnet_quint8", "cpu");

		expect(first).toBe(second);
		expect(ortMocks.create).toHaveBeenCalledTimes(1);
		expect(modelCacheMocks.loadModelBytes).toHaveBeenCalledWith("isnet_quint8", { onProgress: undefined });
		expect(ortMocks.create).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ executionProviders: ["wasm"], graphOptimizationLevel: "all" }));
		expect(ortMocks.env.wasm.wasmPaths).toEqual({ mjs: ortWasmSimdThreadedModuleUrl, wasm: ortWasmSimdThreadedUrl });
		expect(ortMocks.env.wasm.numThreads).toBeGreaterThanOrEqual(1);
		expect(ortMocks.env.wasm.proxy).toBe(false);
		expect(ortMocks.env.logLevel).toBe("error");
	});

	it("creates WebGPU sessions with the JSEP runtime", async () => {
		const session = await runtime.getSegmentationSession("isnet_fp16", "gpu");

		expect(session.inputSize).toBe(1024);
		expect(ortMocks.create).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ executionProviders: ["webgpu"] }));
		expect(ortMocks.env.wasm.wasmPaths).toEqual({ mjs: ortWasmSimdThreadedJsepModuleUrl, wasm: ortWasmSimdThreadedJsepUrl });
	});

	it("feeds a planar float tensor to the pinned graph input and returns the mask", async () => {
		let feeds: Record<string, InstanceType<typeof ortMocks.Tensor>> = {};
		ortMocks.create.mockResolvedValue({
			run: vi.fn(async (received: Record<string, InstanceType<typeof ortMocks.Tensor>>) => {
				feeds = received;
				return { output: { data: new Float32Array([0.25, 0.75]) } };
			}),
		});

		const session = await runtime.getSegmentationSession("isnet", "cpu");
		const input = new Float32Array(3);
		const output = await session.run(input);

		expect(output).toEqual(new Float32Array([0.25, 0.75]));
		expect(feeds.input?.type).toBe("float32");
		expect(feeds.input?.dims).toEqual([1, 3, 1024, 1024]);
		expect(feeds.input?.data).toBe(input);
	});

	it("rejects sessions that do not return the alpha mask", async () => {
		ortMocks.create.mockResolvedValue({ run: vi.fn(async () => ({})) });

		const session = await runtime.getSegmentationSession("isnet", "cpu");

		await expect(session.run(new Float32Array(1))).rejects.toThrow("did not return an alpha mask");
	});

	it("evicts failed sessions so the next attempt retries", async () => {
		ortMocks.create
			.mockRejectedValueOnce(new Error("no available backend found. ERR: [webgpu] webgpuInit is not a function"))
			.mockResolvedValueOnce({ run: vi.fn(async () => ({ output: { data: new Float32Array([1]) } })) });

		await expect(runtime.getSegmentationSession("isnet_fp16", "gpu")).rejects.toThrow("webgpuInit is not a function");
		await expect(runtime.getSegmentationSession("isnet_fp16", "gpu")).resolves.toBeDefined();
		expect(ortMocks.create).toHaveBeenCalledTimes(2);
	});
});
