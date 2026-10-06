import { describe, expect, it } from "vitest";
import { applyTheme, isTheme, LEGACY_THEME_STORAGE_KEY, readStoredTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme";

const storageWith = (entries: Record<string, string | undefined>): Pick<Storage, "getItem"> => ({
	getItem: (key: string) => entries[key] ?? null,
});

const createRoot = () => {
	const classes = new Set<string>();
	const root = {
		classList: {
			toggle: (name: string, force?: boolean) => {
				if (force) classes.add(name);
				else classes.delete(name);
			},
		},
		style: {} as CSSStyleDeclaration,
	} as unknown as Pick<HTMLElement, "classList" | "style">;
	return { classes, root };
};

describe("theme", () => {
	it("recognizes only supported theme values", () => {
		expect(["light", "dark", "system"].every((value) => isTheme(value))).toBe(true);
		expect(["", "Dark", undefined, null].some((value) => isTheme(value))).toBe(false);
	});

	it("reads the primary storage key, falls back to the legacy key, and defaults to system", () => {
		expect(readStoredTheme(storageWith({ [THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
		expect(readStoredTheme(storageWith({ [LEGACY_THEME_STORAGE_KEY]: "light" }))).toBe("light");
		expect(readStoredTheme(storageWith({ [THEME_STORAGE_KEY]: "sepia" }))).toBe("system");
		expect(readStoredTheme(storageWith({}))).toBe("system");
		expect(readStoredTheme(undefined)).toBe("system");
	});

	it("defaults to system when storage access throws", () => {
		const storage = {
			getItem: () => {
				throw new Error("storage is blocked");
			},
		};
		expect(readStoredTheme(storage)).toBe("system");
	});

	it("resolves the system theme from the media preference", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
		expect(resolveTheme("light", true)).toBe("light");
	});

	it("applies mutually exclusive classes and the color scheme", () => {
		const { classes, root } = createRoot();

		applyTheme(root, "dark");
		expect([...classes]).toEqual(["dark"]);
		expect(root.style.colorScheme).toBe("dark");

		applyTheme(root, "light");
		expect([...classes]).toEqual(["light"]);
		expect(root.style.colorScheme).toBe("light");
	});
});
