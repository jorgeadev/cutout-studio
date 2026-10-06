import { afterEach, describe, expect, it, vi } from "vitest";
import { digestSha256, downloadModelBuffer, loadPinnedModel, matchesModelDescriptor, MODEL_CACHE_NAME } from "@/lib/model-cache";
import type { ModelDescriptor } from "@/lib/model-registry";

const encoder = new TextEncoder();

const descriptorFor = async (payload: Uint8Array): Promise<ModelDescriptor> => ({
	file: "onnx/test.onnx",
	bytes: payload.byteLength,
	sha256: await digestSha256(payload.buffer as ArrayBuffer),
});

const streamResponse = (payload: Uint8Array, chunkSize: number): Response => {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
				controller.enqueue(payload.slice(offset, offset + chunkSize));
			}
			controller.close();
		},
	});
	return new Response(stream, { headers: { "content-length": String(payload.byteLength) } });
};

class FakeCache {
	private readonly store = new Map<string, Response>();

	async delete(url: string): Promise<boolean> {
		return this.store.delete(url);
	}

	async match(url: string): Promise<Response | undefined> {
		return this.store.get(url);
	}

	async put(url: string, response: Response): Promise<void> {
		this.store.set(url, response);
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("model integrity", () => {
	it("matches descriptors only when size and digest agree", async () => {
		const payload = encoder.encode("abc");
		const descriptor = await descriptorFor(payload);

		await expect(matchesModelDescriptor(payload.buffer as ArrayBuffer, descriptor)).resolves.toBe(true);
		await expect(matchesModelDescriptor(encoder.encode("abcd").buffer as ArrayBuffer, descriptor)).resolves.toBe(false);
		await expect(matchesModelDescriptor(encoder.encode("abd").buffer as ArrayBuffer, descriptor)).resolves.toBe(false);
	});
});

describe("model download", () => {
	it("streams the pinned model, reports progress, and verifies the digest", async () => {
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = await descriptorFor(payload);
		const progress: number[] = [];
		const fetchImpl = vi.fn(async () => streamResponse(payload, 5));

		const bytes = await downloadModelBuffer("https://example.test/model.onnx", descriptor, { fetchImpl, onProgress: (fraction) => progress.push(fraction) });

		expect(new Uint8Array(bytes)).toEqual(payload);
		expect(progress.length).toBeGreaterThan(1);
		expect(progress.at(-1)).toBe(1);
		expect(progress).toEqual([...progress].sort((a, b) => a - b));
	});

	it("rejects a download whose bytes do not match the pinned digest", async () => {
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = { ...(await descriptorFor(payload)), sha256: "0".repeat(64) };
		const fetchImpl = vi.fn(async () => streamResponse(payload, 5));

		await expect(downloadModelBuffer("https://example.test/model.onnx", descriptor, { fetchImpl })).rejects.toThrow("integrity check");
	});

	it("rejects a response that grows beyond the pinned size", async () => {
		const payload = encoder.encode("abcdef");
		const descriptor = await descriptorFor(payload.slice(0, 3));
		const fetchImpl = vi.fn(async () => streamResponse(payload, 2));

		await expect(downloadModelBuffer("https://example.test/model.onnx", descriptor, { fetchImpl })).rejects.toThrow("pinned size");
	});

	it("reports HTTP failures with the status code", async () => {
		const descriptor = await descriptorFor(encoder.encode("abc"));
		const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

		await expect(downloadModelBuffer("https://example.test/model.onnx", descriptor, { fetchImpl })).rejects.toThrow("HTTP 503");
	});

	it("falls back to arrayBuffer when the response has no stream", async () => {
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = await descriptorFor(payload);
		const fetchImpl = vi.fn(
			async () =>
				({
					ok: true,
					status: 200,
					body: null,
					arrayBuffer: async () => payload.buffer,
					headers: new Headers(),
				}) as unknown as Response,
		);
		const onProgress = vi.fn();

		const bytes = await downloadModelBuffer("https://example.test/model.onnx", descriptor, { fetchImpl, onProgress });

		expect(new Uint8Array(bytes)).toEqual(payload);
		expect(onProgress).toHaveBeenCalledWith(1);
	});
});

describe("model caching", () => {
	it("stores verified downloads and reuses them without network access", async () => {
		const cache = new FakeCache();
		const open = vi.fn(async () => cache);
		vi.stubGlobal("caches", { open });
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = await descriptorFor(payload);
		const fetchImpl = vi.fn(async () => streamResponse(payload, 5));

		const first = await loadPinnedModel("https://example.test/model.onnx", descriptor, { fetchImpl });
		const second = await loadPinnedModel("https://example.test/model.onnx", descriptor, { fetchImpl });

		expect(open).toHaveBeenCalledWith(MODEL_CACHE_NAME);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(new Uint8Array(first)).toEqual(payload);
		expect(new Uint8Array(second)).toEqual(payload);
	});

	it("discards a corrupted cache entry and downloads again", async () => {
		const cache = new FakeCache();
		vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
		const url = "https://example.test/model.onnx";
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = await descriptorFor(payload);
		await cache.put(url, new Response(encoder.encode("corrupt")));
		const fetchImpl = vi.fn(async () => streamResponse(payload, 5));

		const bytes = await loadPinnedModel(url, descriptor, { fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(new Uint8Array(bytes)).toEqual(payload);
	});

	it("still downloads when Cache Storage is unavailable", async () => {
		vi.stubGlobal("caches", {
			open: vi.fn(async () => {
				throw new Error("cache storage is disabled");
			}),
		});
		const payload = encoder.encode("a-model-file-payload");
		const descriptor = await descriptorFor(payload);
		const fetchImpl = vi.fn(async () => streamResponse(payload, 5));

		await expect(loadPinnedModel("https://example.test/model.onnx", descriptor, { fetchImpl })).resolves.toBeInstanceOf(ArrayBuffer);
	});
});
