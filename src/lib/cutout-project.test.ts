import { describe, expect, it } from "vitest";
import { CUTOUT_PROJECT_MIME, createCutoutProject, cutoutProjectFileName, readCutoutProject } from "@/lib/cutout-project";

describe(".cutout project files", () => {
	it("round-trips the original and transparent edited result", async () => {
		const original = new Blob(["original pixels"], { type: "image/jpeg" });
		const edited = new Blob(["edited pixels"], { type: "image/png" });

		const project = await createCutoutProject({ original, originalName: "portraits/person.jpg", edited });
		const loaded = await readCutoutProject(project);

		expect(project.type).toBe(CUTOUT_PROJECT_MIME);
		expect(loaded.originalName).toBe("person.jpg");
		expect(loaded.original.type).toBe("image/jpeg");
		expect(loaded.edited.type).toBe("image/png");
		await expect(loaded.original.text()).resolves.toBe("original pixels");
		await expect(loaded.edited.text()).resolves.toBe("edited pixels");
	});

	it("creates a safe project filename", () => {
		expect(cutoutProjectFileName("portraits/person.final.jpg")).toBe("person.final.cutout");
		expect(cutoutProjectFileName(".png")).toBe("cutout-project.cutout");
	});

	it("rejects malformed and unsupported project files", async () => {
		await expect(readCutoutProject(new Blob(["not a zip"]))).rejects.toThrow("Could not open this .cutout project");

		const { default: JSZip } = await import("jszip");
		const zip = new JSZip();
		zip.file("manifest.json", JSON.stringify({ kind: "cutout-studio-project", version: 2 }));
		const bytes = await zip.generateAsync({ type: "uint8array" });
		await expect(readCutoutProject(new Blob([bytes.slice().buffer as ArrayBuffer]))).rejects.toThrow("version is not supported");
	});
});
