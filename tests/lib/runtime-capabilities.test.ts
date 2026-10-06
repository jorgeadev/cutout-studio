import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
});

describe("processing device capability detection", () => {
	it("uses CPU when browser globals are unavailable", async () => {
		vi.stubGlobal("navigator", undefined);
		const { hasWebGpuAdapter, resolveProcessingDevice } = await import("@/lib/runtime-capabilities");

		await expect(hasWebGpuAdapter()).resolves.toBe(false);
		await expect(resolveProcessingDevice("auto")).resolves.toBe("cpu");
	});

	it("uses CPU automatically when WebGPU is not exposed", async () => {
		vi.stubGlobal("navigator", {});
		const { hasWebGpuAdapter, resolveProcessingDevice } = await import("@/lib/runtime-capabilities");

		await expect(hasWebGpuAdapter()).resolves.toBe(false);
		await expect(resolveProcessingDevice("auto")).resolves.toBe("cpu");
	});

	it("caches the absence of an adapter and uses CPU", async () => {
		const requestAdapter = vi.fn(async () => null);
		vi.stubGlobal("navigator", { gpu: { requestAdapter } });
		const { hasWebGpuAdapter, resolveProcessingDevice } = await import("@/lib/runtime-capabilities");

		await expect(hasWebGpuAdapter()).resolves.toBe(false);
		await expect(resolveProcessingDevice("auto")).resolves.toBe("cpu");
		expect(requestAdapter).toHaveBeenCalledOnce();
	});

	it("caches a usable adapter and keeps explicit device choices", async () => {
		const requestAdapter = vi.fn(async () => ({}));
		vi.stubGlobal("navigator", { gpu: { requestAdapter } });
		const { hasWebGpuAdapter, resolveProcessingDevice } = await import("@/lib/runtime-capabilities");

		await expect(resolveProcessingDevice("cpu")).resolves.toBe("cpu");
		await expect(resolveProcessingDevice("gpu")).resolves.toBe("gpu");
		await expect(hasWebGpuAdapter()).resolves.toBe(true);
		await expect(resolveProcessingDevice("auto")).resolves.toBe("gpu");
		expect(requestAdapter).toHaveBeenCalledOnce();
	});

	it("falls back to CPU when adapter discovery rejects", async () => {
		const requestAdapter = vi.fn(async () => {
			throw new Error("Adapter discovery failed");
		});
		vi.stubGlobal("navigator", { gpu: { requestAdapter } });
		const { resolveProcessingDevice } = await import("@/lib/runtime-capabilities");

		await expect(resolveProcessingDevice("auto")).resolves.toBe("cpu");
		expect(requestAdapter).toHaveBeenCalledOnce();
	});
});
