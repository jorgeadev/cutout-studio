import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExportOptions } from "@/components/studio/export-options";
import { JobCard } from "@/components/studio/job-card";
import { MaskEditor } from "@/components/studio/mask-editor";
import { Uploader } from "@/components/studio/uploader";
import { DEFAULT_EXPORT } from "@/lib/defaults";
import type { ImageJob } from "@/types/job";

const completedJob = {
	id: "portrait-1",
	file: new Blob(["portrait"], { type: "image/png" }),
	name: "portrait.png",
	size: 8,
	originalUrl: "blob:original",
	cutoutUrl: "blob:cutout",
	status: "done",
	progress: 1,
	aiImproved: true,
	manuallyEdited: true,
	processing: { model: "isnet_fp16", algorithm: "refine", device: "auto" },
} as ImageJob;

describe("per-image result actions", () => {
	it("offers result-image and reopenable project workflows", () => {
		const imageExport = renderToStaticMarkup(<ExportOptions value={DEFAULT_EXPORT} onChange={vi.fn()} />);
		const projectExport = renderToStaticMarkup(<ExportOptions value={{ ...DEFAULT_EXPORT, downloadKind: "project" }} onChange={vi.fn()} />);
		const uploader = renderToStaticMarkup(<Uploader onFiles={vi.fn()} onProject={vi.fn()} />);

		expect(imageExport).toContain("Result image");
		expect(projectExport).toContain("Editable .cutout project");
		expect(projectExport).toContain("original and transparent refined result");
		expect(uploader).toContain("Open .cutout");
		expect(uploader).toContain('accept=".cutout,application/vnd.cutout-studio.project+zip"');
	});

	it("offers AI improvement and manual editing on completed cards", () => {
		const markup = renderToStaticMarkup(
			<JobCard job={completedJob} backgroundCss={null} onDownload={vi.fn()} onEdit={vi.fn()} onImprove={vi.fn()} onRemove={vi.fn()} onRetry={vi.fn()} />,
		);

		expect(markup).toContain("AI improve");
		expect(markup).toContain("AI Precision");
		expect(markup).toContain("Hand refined");
		expect(markup).toContain("Edit result");
		expect(markup).toContain("Download");
	});

	it("renders a dedicated editor page with both brush actions, zoom presets, history, precision, and save controls", () => {
		const markup = renderToStaticMarkup(<MaskEditor job={completedJob} onClose={vi.fn()} onImprove={vi.fn()} onSave={vi.fn()} />);

		for (const label of [
			"Restore pixels",
			"Make transparent",
			"Brush",
			"Magic selector",
			"Load edited image",
			"Pan",
			"Fit",
			"100%",
			"Undo",
			"Reset",
			"Run precision pass",
			"Save refinement",
		])
			expect(markup).toContain(label);
		expect(markup).toContain("Space + drag pan");
		expect(markup).toContain("10–3200%");
		expect(markup).toContain('accept="image/png,image/webp,.png,.webp"');
		expect(markup).toContain('data-page="mask-editor"');
		expect(markup).toContain("Back to studio");
		expect(markup).toContain('style="width:100%;flex-shrink:0"');
		expect(markup).not.toContain('role="dialog"');
		expect(markup).not.toContain('aria-modal="true"');
	});
});
