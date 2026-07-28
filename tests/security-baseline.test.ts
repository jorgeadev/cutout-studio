import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";
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

		const productionConfig = JSON.parse(readRepositoryFile("vercel.json")) as {
			headers: Array<{ headers: Array<{ key: string; value: string }> }>;
		};
		const headers = Object.fromEntries(productionConfig.headers[0]?.headers.map(({ key, value }) => [key, value]) ?? []);
		expect(headers).toMatchObject({
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		});
	});

	it("only trusts the exact model host and its real subdomains", () => {
		const serviceWorkerSource = readRepositoryFile("public", "sw.js");
		const sandbox: Record<string, unknown> = {
			URL,
			self: {
				addEventListener: () => undefined,
				location: { origin: "https://cutout-studio.example" },
			},
		};
		runInNewContext(
			`${serviceWorkerSource}\nglobalThis.__hostChecks = [isTrustedModelHostname("staticimgly.com"), isTrustedModelHostname("cdn.staticimgly.com"), isTrustedModelHostname("evilstaticimgly.com"), isTrustedModelHostname("staticimgly.com.attacker.example")];`,
			sandbox,
		);

		expect(sandbox.__hostChecks).toEqual([true, true, false, false]);
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
			expect(workflow).toMatch(/^permissions:/m);
			expect(workflow).not.toContain("permissions: write-all");
			expect(workflow).not.toContain("pull_request_target");
		}
	});

	it("keeps package installation supply-chain policies enabled", () => {
		const pnpmPolicy = readRepositoryFile("pnpm-workspace.yaml");
		expect(pnpmPolicy).toMatch(/^minimumReleaseAge:\s*1440$/m);
		expect(pnpmPolicy).toMatch(/^minimumReleaseAgeStrict:\s*true$/m);
		expect(pnpmPolicy).toMatch(/^minimumReleaseAgeIgnoreMissingTime:\s*false$/m);
		expect(pnpmPolicy).toMatch(/^trustPolicy:\s*no-downgrade$/m);
		expect(pnpmPolicy).toMatch(/^trustLockfile:\s*false$/m);
		expect(pnpmPolicy).toMatch(/^blockExoticSubdeps:\s*true$/m);
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
