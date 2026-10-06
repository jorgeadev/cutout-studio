import { describe, expect, it } from "vitest";
import { ISNET_MODEL_HOST, ISNET_MODEL_REVISION, MODEL_DESCRIPTORS, MODEL_INPUT_SIZE, modelSourceUrl } from "@/lib/model-registry";

const MODELS = ["isnet_quint8", "isnet_fp16", "isnet"] as const;

describe("model registry", () => {
	it("pins every model to the exact Hugging Face revision with a SHA-256 digest", () => {
		expect(ISNET_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
		for (const model of MODELS) {
			const descriptor = MODEL_DESCRIPTORS[model];
			const url = new URL(modelSourceUrl(model));
			expect(url.protocol).toBe("https:");
			expect(url.hostname).toBe(ISNET_MODEL_HOST);
			expect(url.pathname).toContain(ISNET_MODEL_REVISION);
			expect(url.pathname).toContain(descriptor.file);
			expect(descriptor.sha256).toMatch(/^[0-9a-f]{64}$/);
			expect(descriptor.bytes).toBeGreaterThan(0);
		}
	});

	it("orders the three model tiers by download size", () => {
		expect(MODEL_DESCRIPTORS.isnet_quint8.bytes).toBeLessThan(MODEL_DESCRIPTORS.isnet_fp16.bytes);
		expect(MODEL_DESCRIPTORS.isnet_fp16.bytes).toBeLessThan(MODEL_DESCRIPTORS.isnet.bytes);
	});

	it("uses the documented 1024 px input", () => {
		expect(MODEL_INPUT_SIZE).toBe(1024);
	});
});
