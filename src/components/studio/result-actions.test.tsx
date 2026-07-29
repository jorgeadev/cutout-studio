import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobCard } from "@/components/studio/job-card";
import { MaskEditor } from "@/components/studio/mask-editor";
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

	it("exposes restore, erase, history, precision, and save controls in the editor", () => {
		const markup = renderToStaticMarkup(<MaskEditor job={completedJob} onClose={vi.fn()} onImprove={vi.fn()} onSave={vi.fn()} />);

		for (const label of ["Restore", "Erase", "Undo", "Reset", "Run precision pass", "Save refinement"]) expect(markup).toContain(label);
		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('aria-modal="true"');
	});
});
