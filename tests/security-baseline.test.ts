import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import { ISNET_MODEL_HOST, ISNET_MODEL_REVISION, MODEL_DESCRIPTORS, modelSourceUrl } from "../src/lib/model-registry";
import viteConfig from "../vite.config";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const readRepositoryFile = (...segments: string[]) => readFileSync(join(repositoryRoot, ...segments), "utf8");

describe("browser security boundaries", () => {
	it("keeps cross-origin isolation enabled in local and production configuration", () => {
		const localConfig = viteConfig as UserConfig;
		expect(localConfig.server?.headers).toMatchObject({
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		});
		expect(localConfig.preview?.headers).toMatchObject({
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		});
		expect(localConfig.optimizeDeps?.exclude ?? []).not.toContain("@imgly/background-removal");

		const productionConfig = JSON.parse(readRepositoryFile("vercel.json")) as {
			headers: Array<{ headers: Array<{ key: string; value: string }> }>;
		};
		const headers = Object.fromEntries(productionConfig.headers[0]?.headers.map(({ key, value }) => [key, value]) ?? []);
		expect(headers).toMatchObject({
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		});
	});

	it("only downloads models from the pinned Hugging Face revision with verified digests", () => {
		expect(ISNET_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
		for (const model of ["isnet_quint8", "isnet_fp16", "isnet"] as const) {
			const url = new URL(modelSourceUrl(model));
			expect(url.protocol).toBe("https:");
			expect(url.hostname).toBe(ISNET_MODEL_HOST);
			expect(url.pathname).toContain(ISNET_MODEL_REVISION);
			expect(MODEL_DESCRIPTORS[model].sha256).toMatch(/^[0-9a-f]{64}$/);
		}

		const registry = readRepositoryFile("src", "lib", "model-registry.ts");
		expect(registry).not.toContain("staticimgly");

		const serviceWorkerSource = readRepositoryFile("public", "sw.js");
		expect(serviceWorkerSource).not.toContain("MODEL_ASSET_HOST");
		expect(serviceWorkerSource).not.toContain("staticimgly");
		expect(serviceWorkerSource).toContain("url.origin !== self.location.origin");
	});

	it("registers installed PWAs to open .cutout projects with an OS file icon", () => {
		const manifest = JSON.parse(readRepositoryFile("public", "manifest.webmanifest")) as {
			file_handlers: Array<{
				action: string;
				accept: Record<string, string[]>;
				icons: Array<{ src: string; sizes: string; type: string }>;
			}>;
		};
		const handler = manifest.file_handlers[0];

		expect(handler?.action).toContain("cutout-project");
		expect(handler?.accept).toEqual({ "application/vnd.cutout-studio.project+zip": [".cutout"] });
		expect(handler?.icons).toContainEqual({ src: "/app-icon-512.png", sizes: "512x512", type: "image/png" });
	});
});

describe("repository automation security", () => {
	it("pins every external workflow action to an immutable commit", () => {
		const workflowDirectory = join(repositoryRoot, ".github", "workflows");
		const workflowFiles = readdirSync(workflowDirectory).filter((fileName) => fileName.endsWith(".yml") || fileName.endsWith(".yaml"));
		expect(workflowFiles.length).toBeGreaterThan(0);

		for (const fileName of workflowFiles) {
			const workflow = readFileSync(join(workflowDirectory, fileName), "utf8");
			const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
			expect(actionReferences.length, `${fileName} should invoke at least one action`).toBeGreaterThan(0);
			for (const reference of actionReferences) {
				expect(reference, `${fileName}: ${reference}`).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}$/);
			}
			if (workflow.includes("actions/checkout@")) expect(workflow).toMatch(/persist-credentials:\s*false/);
			if (workflow.includes("pnpm install")) {
				expect(workflow).toMatch(/pnpm\/action-setup@[0-9a-f]{40}/);
				expect(workflow).not.toContain("corepack enable");
			}
			if (workflow.includes('"20.19.0"')) expect(workflow).toMatch(/standalone:\s*true/);
			expect(workflow).toMatch(/^permissions:/m);
			expect(workflow).not.toContain("permissions: write-all");
			expect(workflow).not.toContain("pull_request_target");
		}
	});

	it("targets every automated pull request at develop", () => {
		const workflowDirectory = join(repositoryRoot, ".github", "workflows");
		const workflowFiles = readdirSync(workflowDirectory).filter((fileName) => fileName.endsWith(".yml") || fileName.endsWith(".yaml"));
		for (const fileName of workflowFiles) {
			const workflow = readFileSync(join(workflowDirectory, fileName), "utf8");
			if (!workflow.includes("pull_request:")) continue;
			expect(workflow, fileName).toMatch(/pull_request:\s*\r?\n\s+branches:\s*\[develop\]/);
			expect(workflow, fileName).not.toMatch(/pull_request:\s*\r?\n\s+branches:\s*\[[^\]]*main/);
		}

		const dependabot = readRepositoryFile(".github", "dependabot.yml");
		const ecosystems = dependabot.match(/^\s+- package-ecosystem:/gm) ?? [];
		const developTargets = dependabot.match(/^\s+target-branch:\s*develop$/gm) ?? [];
		expect(developTargets).toHaveLength(ecosystems.length);

		const pullRequestTemplate = readRepositoryFile(".github", "PULL_REQUEST_TEMPLATE.md");
		expect(pullRequestTemplate).toContain("base branch to `develop`");
		expect(pullRequestTemplate).toContain("never target `main`");
	});

	it("keeps package installation supply-chain policies enabled", () => {
		const pnpmPolicy = readRepositoryFile("pnpm-workspace.yaml");
		expect(pnpmPolicy).toMatch(/^strictPeerDependencies:\s*true$/m);
		expect(pnpmPolicy).toMatch(/^minimumReleaseAge:\s*1440$/m);
		expect(pnpmPolicy).toMatch(/^minimumReleaseAgeStrict:\s*true$/m);
		expect(pnpmPolicy).toMatch(/^minimumReleaseAgeIgnoreMissingTime:\s*false$/m);
		expect(pnpmPolicy).toMatch(/^trustPolicy:\s*no-downgrade$/m);
		expect(pnpmPolicy).toMatch(/^trustLockfile:\s*false$/m);
		expect(pnpmPolicy).toMatch(/^blockExoticSubdeps:\s*true$/m);
	});

	it("pins ONNX Runtime and no longer bundles the IMG.LY runtime", () => {
		const applicationPackage = JSON.parse(readRepositoryFile("package.json")) as {
			dependencies: Record<string, string>;
		};
		const pnpmPolicy = readRepositoryFile("pnpm-workspace.yaml");

		expect(applicationPackage.dependencies["onnxruntime-web"]).toBe("catalog:");
		expect(applicationPackage.dependencies["@imgly/background-removal"]).toBeUndefined();
		expect(pnpmPolicy).not.toMatch(/imgly/i);
		const runtimeVersion = pnpmPolicy.match(/^catalog:\s*\r?\n(?:\s{2}#[^\r\n]*\r?\n)*\s{2}onnxruntime-web:\s*(\S+)$/m)?.[1];
		expect(runtimeVersion).toMatch(/^\d+\.\d+\.\d+$/);
		const installedRuntime = JSON.parse(readRepositoryFile("node_modules", "onnxruntime-web", "package.json")) as { version: string };
		expect(installedRuntime.version).toBe(runtimeVersion);
		const runtimeSource = readRepositoryFile("src", "lib", "onnx-runtime.ts");
		for (const asset of [
			"ort-wasm-simd-threaded.mjs",
			"ort-wasm-simd-threaded.wasm",
			"ort-wasm-simd-threaded.jsep.mjs",
			"ort-wasm-simd-threaded.jsep.wasm",
		]) {
			expect(runtimeSource).toContain(`onnxruntime-web/${asset}?url`);
		}
	});

	it("requires human accountability and security checks for AI-assisted changes", () => {
		const policy = readRepositoryFile("AI_CONTRIBUTIONS.md").toLowerCase();
		const pullRequestTemplate = readRepositoryFile(".github", "PULL_REQUEST_TEMPLATE.md").toLowerCase();
		expect(policy).toContain("human reviewer");
		expect(policy).toContain("hallucinated");
		expect(policy).toContain("prompt injection");
		expect(policy).toContain("license");
		expect(pullRequestTemplate).toContain("ai assistance");
		expect(pullRequestTemplate).toContain("pnpm test:coverage");
	});
});
