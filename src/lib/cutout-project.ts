const PROJECT_KIND = "cutout-studio-project";
const PROJECT_VERSION = 1;
const MANIFEST_PATH = "manifest.json";
const ORIGINAL_PATH = "assets/original";
const EDITED_PATH = "assets/edited";
const PREVIEW_PATH = "preview.png";

export const CUTOUT_PROJECT_MIME = "application/vnd.cutout-studio.project+zip";
export const MAX_CUTOUT_PROJECT_BYTES = 250 * 1024 * 1024;

interface ProjectAsset {
	path: string;
	name: string;
	mimeType: string;
	size: number;
}

interface CutoutProjectManifest {
	kind: typeof PROJECT_KIND;
	version: typeof PROJECT_VERSION;
	original: ProjectAsset;
	edited: ProjectAsset;
	/** Optional so projects written before previews were introduced remain readable. */
	preview?: ProjectAsset;
}

export interface CutoutProjectContents {
	original: Blob;
	originalName: string;
	edited: Blob;
	preview: Blob;
}

const imageMimeType = (value: string, fallback: string): string => (value.startsWith("image/") ? value : fallback);

const ownedArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

const fileNameOnly = (value: string): string => value.split(/[\\/]/).at(-1)?.trim() || "original.png";

export const cutoutProjectFileName = (originalName: string): string => {
	const base =
		fileNameOnly(originalName)
			.replace(/\.[^./\\]+$/, "")
			.trim() || "cutout-project";
	return `${base}.cutout`;
};

export const createCutoutProject = async (contents: CutoutProjectContents): Promise<Blob> => {
	if (!contents.original.size || !contents.edited.size || !contents.preview.size) throw new Error("The original, edited, and preview images are required");
	const originalName = fileNameOnly(contents.originalName);
	const originalMimeType = imageMimeType(contents.original.type, "image/png");
	const editedMimeType = imageMimeType(contents.edited.type, "image/png");
	const previewMimeType = imageMimeType(contents.preview.type, "image/png");
	if (contents.original.size + contents.edited.size + contents.preview.size > MAX_CUTOUT_PROJECT_BYTES) throw new Error("The .cutout project contents are too large");
	const manifest: CutoutProjectManifest = {
		kind: PROJECT_KIND,
		version: PROJECT_VERSION,
		original: { path: ORIGINAL_PATH, name: originalName, mimeType: originalMimeType, size: contents.original.size },
		edited: { path: EDITED_PATH, name: "edited.png", mimeType: editedMimeType, size: contents.edited.size },
		preview: { path: PREVIEW_PATH, name: "preview.png", mimeType: previewMimeType, size: contents.preview.size },
	};

	const { default: JSZip } = await import("jszip");
	const zip = new JSZip();
	zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
	zip.file(ORIGINAL_PATH, new Uint8Array(await contents.original.arrayBuffer()));
	zip.file(EDITED_PATH, new Uint8Array(await contents.edited.arrayBuffer()));
	zip.file(PREVIEW_PATH, new Uint8Array(await contents.preview.arrayBuffer()));
	const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
	return new Blob([ownedArrayBuffer(bytes)], { type: CUTOUT_PROJECT_MIME });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseAsset = (value: unknown, expectedPath: string): ProjectAsset => {
	if (!isRecord(value) || value.path !== expectedPath || typeof value.name !== "string" || typeof value.mimeType !== "string" || !value.mimeType.startsWith("image/")) {
		throw new Error("Invalid .cutout project asset metadata");
	}
	if (typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size <= 0) throw new Error("Invalid .cutout project asset size");
	return { path: expectedPath, name: fileNameOnly(value.name), mimeType: value.mimeType, size: value.size };
};

export const readCutoutProject = async (project: Blob): Promise<CutoutProjectContents> => {
	if (!project.size || project.size > MAX_CUTOUT_PROJECT_BYTES) throw new Error("The .cutout project is empty or too large");
	try {
		const { default: JSZip } = await import("jszip");
		const zip = await JSZip.loadAsync(await project.arrayBuffer());
		const manifestEntry = zip.file(MANIFEST_PATH);
		if (!manifestEntry) throw new Error("Invalid .cutout project: manifest is missing");
		const parsed: unknown = JSON.parse(await manifestEntry.async("string"));
		if (!isRecord(parsed) || parsed.kind !== PROJECT_KIND || parsed.version !== PROJECT_VERSION) throw new Error("This .cutout project version is not supported");
		const originalMetadata = parseAsset(parsed.original, ORIGINAL_PATH);
		const editedMetadata = parseAsset(parsed.edited, EDITED_PATH);
		const previewMetadata = parsed.preview === undefined ? undefined : parseAsset(parsed.preview, PREVIEW_PATH);
		if (originalMetadata.size + editedMetadata.size + (previewMetadata?.size ?? 0) > MAX_CUTOUT_PROJECT_BYTES) throw new Error("The .cutout project contents are too large");

		const originalEntry = zip.file(originalMetadata.path);
		const editedEntry = zip.file(editedMetadata.path);
		if (!originalEntry || !editedEntry) throw new Error("Invalid .cutout project: image data is missing");
		const previewEntry = previewMetadata ? zip.file(previewMetadata.path) : undefined;
		if (previewMetadata && !previewEntry) throw new Error("Invalid .cutout project: preview image is missing");
		const [originalBytes, editedBytes, previewBytes] = await Promise.all([originalEntry.async("uint8array"), editedEntry.async("uint8array"), previewEntry?.async("uint8array")]);
		if (originalBytes.byteLength !== originalMetadata.size || editedBytes.byteLength !== editedMetadata.size) throw new Error("Invalid .cutout project: image sizes do not match");
		if (previewMetadata && previewBytes?.byteLength !== previewMetadata.size) throw new Error("Invalid .cutout project: preview image size does not match");
		const edited = new Blob([ownedArrayBuffer(editedBytes)], { type: editedMetadata.mimeType });

		return {
			original: new Blob([ownedArrayBuffer(originalBytes)], { type: originalMetadata.mimeType }),
			originalName: originalMetadata.name,
			edited,
			preview: previewMetadata && previewBytes ? new Blob([ownedArrayBuffer(previewBytes)], { type: previewMetadata.mimeType }) : edited,
		};
	} catch (reason) {
		if (reason instanceof Error && (reason.message.includes(".cutout project") || reason.message.includes("not supported"))) throw reason;
		throw new Error("Could not open this .cutout project");
	}
};
