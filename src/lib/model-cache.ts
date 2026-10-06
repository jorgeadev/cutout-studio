import { MODEL_DESCRIPTORS, modelSourceUrl, type ModelDescriptor } from "@/lib/model-registry";
import type { ModelQuality } from "@/types/processing";

export const MODEL_CACHE_NAME = "cutout-studio-models-v1";

export interface ModelDownloadOptions {
	/** Receives a 0..1 fraction while the model is fetched or restored. */
	onProgress?: (fraction: number) => void;
	/** Overridable for tests. */
	fetchImpl?: typeof fetch;
}

const toHex = (bytes: ArrayBuffer): string => {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const digestSha256 = async (bytes: ArrayBuffer): Promise<string> => {
	return toHex(await crypto.subtle.digest("SHA-256", bytes));
};

export const matchesModelDescriptor = async (bytes: ArrayBuffer, descriptor: ModelDescriptor): Promise<boolean> => {
	if (bytes.byteLength !== descriptor.bytes) return false;
	return (await digestSha256(bytes)) === descriptor.sha256;
};

const openModelCache = async (): Promise<Cache | undefined> => {
	try {
		if (typeof caches === "undefined") return undefined;
		return await caches.open(MODEL_CACHE_NAME);
	} catch {
		// Cache storage can be unavailable in private browsing; downloads still work.
		return undefined;
	}
};

const readCachedModel = async (url: string): Promise<ArrayBuffer | undefined> => {
	const cache = await openModelCache();
	if (!cache) return undefined;
	try {
		const response = await cache.match(url);
		return response ? await response.arrayBuffer() : undefined;
	} catch {
		return undefined;
	}
};

const writeCachedModel = async (url: string, bytes: ArrayBuffer): Promise<void> => {
	const cache = await openModelCache();
	if (!cache) return;
	try {
		await cache.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
	} catch {
		// A full or read-only cache must not fail the download.
	}
};

const deleteCachedModel = async (url: string): Promise<void> => {
	const cache = await openModelCache();
	if (!cache) return;
	try {
		await cache.delete(url);
	} catch {
		// Ignore cache eviction failures.
	}
};

/** Streams a pinned model into memory, reporting progress and enforcing SHA-256. */
export const downloadModelBuffer = async (url: string, descriptor: ModelDescriptor, options: ModelDownloadOptions = {}): Promise<ArrayBuffer> => {
	const { onProgress, fetchImpl = fetch } = options;
	const response = await fetchImpl(url);
	if (!response.ok) throw new Error(`Could not download the background model (HTTP ${response.status})`);
	const reader = response.body?.getReader();
	let bytes: ArrayBuffer;
	if (!reader) {
		bytes = await response.arrayBuffer();
		onProgress?.(1);
	} else {
		const declared = Number(response.headers.get("content-length"));
		const total = Number.isFinite(declared) && declared > 0 ? declared : descriptor.bytes;
		const buffer = new Uint8Array(descriptor.bytes);
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			if (received + value.byteLength > buffer.byteLength) {
				throw new Error("The downloaded background model did not match its pinned size");
			}
			buffer.set(value, received);
			received += value.byteLength;
			onProgress?.(Math.min(1, received / total));
		}
		bytes = buffer.buffer;
	}
	if (!(await matchesModelDescriptor(bytes, descriptor))) {
		throw new Error("The downloaded background model failed its integrity check");
	}
	return bytes;
};

/** Loads a pinned model from Cache Storage when possible, otherwise downloads it. */
export const loadPinnedModel = async (url: string, descriptor: ModelDescriptor, options: ModelDownloadOptions = {}): Promise<ArrayBuffer> => {
	const cached = await readCachedModel(url);
	if (cached) {
		if (await matchesModelDescriptor(cached, descriptor)) {
			options.onProgress?.(1);
			return cached;
		}
		await deleteCachedModel(url);
	}
	const bytes = await downloadModelBuffer(url, descriptor, options);
	await writeCachedModel(url, bytes);
	return bytes;
};

export const loadModelBytes = async (model: ModelQuality, options: ModelDownloadOptions = {}): Promise<ArrayBuffer> => {
	return loadPinnedModel(modelSourceUrl(model), MODEL_DESCRIPTORS[model], options);
};
