import { describe, expect, it } from "vitest";
import { DEFAULT_PROCESSING } from "@/lib/defaults";
import { ALGORITHM_OPTIONS, DEVICE_OPTIONS, MODEL_OPTIONS, precisionProcessingConfig } from "@/lib/processing-options";

describe("processing options", () => {
	it("keeps option identifiers unique and defaults selectable", () => {
		const modelValues = MODEL_OPTIONS.map((option) => option.value);
		const algorithmValues = ALGORITHM_OPTIONS.map((option) => option.value);
		const deviceValues = DEVICE_OPTIONS.map((option) => option.value);

		expect(new Set(modelValues).size).toBe(modelValues.length);
		expect(new Set(algorithmValues).size).toBe(algorithmValues.length);
		expect(new Set(deviceValues).size).toBe(deviceValues.length);
		expect(modelValues).toContain(DEFAULT_PROCESSING.model);
		expect(algorithmValues).toContain(DEFAULT_PROCESSING.algorithm);
		expect(deviceValues).toContain(DEFAULT_PROCESSING.device);
	});

	it("has exactly one recommended model and complete user-facing metadata", () => {
		expect(MODEL_OPTIONS.filter((option) => option.recommended)).toHaveLength(1);
		for (const option of MODEL_OPTIONS) {
			expect(option.name).not.toHaveLength(0);
			expect(option.description).not.toHaveLength(0);
			expect(option.precision).toMatch(/bit$/);
			expect(option.size).toMatch(/^~\d+ MB$/);
		}
	});

	it("builds the per-image AI Precision configuration with the selected processor", () => {
		expect(precisionProcessingConfig("auto")).toEqual({ model: "isnet", algorithm: "hair", device: "auto" });
		expect(precisionProcessingConfig("cpu").device).toBe("cpu");
	});
});
