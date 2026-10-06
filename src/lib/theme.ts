export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "cutout-studio-theme";
export const LEGACY_THEME_STORAGE_KEY = "cutout-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const isTheme = (value: unknown): value is Theme => {
	return value === "light" || value === "dark" || value === "system";
};

export const readStoredTheme = (storage: Pick<Storage, "getItem"> | undefined): Theme => {
	try {
		const stored = storage?.getItem(THEME_STORAGE_KEY) ?? storage?.getItem(LEGACY_THEME_STORAGE_KEY);
		return isTheme(stored) ? stored : "system";
	} catch {
		// Storage can be unavailable in private or restricted contexts.
		return "system";
	}
};

export const resolveTheme = (theme: Theme, systemPrefersDark: boolean): ResolvedTheme => {
	if (theme === "system") return systemPrefersDark ? "dark" : "light";
	return theme;
};

export const applyTheme = (root: Pick<HTMLElement, "classList" | "style">, resolved: ResolvedTheme): void => {
	root.classList.toggle("dark", resolved === "dark");
	root.classList.toggle("light", resolved === "light");
	root.style.colorScheme = resolved;
};
