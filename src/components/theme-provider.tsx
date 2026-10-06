import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme, isTheme, LEGACY_THEME_STORAGE_KEY, readStoredTheme, resolveTheme, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, type ResolvedTheme, type Theme } from "@/lib/theme";

interface ThemeContextValue {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const browserStorage = (): Storage | undefined => {
	try {
		return typeof window === "undefined" ? undefined : window.localStorage;
	} catch {
		return undefined;
	}
};

const systemPrefersDark = (): boolean => {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	return window.matchMedia(THEME_MEDIA_QUERY).matches;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
	const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(browserStorage()));
	const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
	const resolvedTheme = resolveTheme(theme, prefersDark);

	useEffect(() => {
		const query = window.matchMedia(THEME_MEDIA_QUERY);
		const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
		setPrefersDark(query.matches);
		query.addEventListener("change", handleChange);
		return () => query.removeEventListener("change", handleChange);
	}, []);

	useEffect(() => {
		applyTheme(document.documentElement, resolvedTheme);
	}, [resolvedTheme]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== THEME_STORAGE_KEY && event.key !== LEGACY_THEME_STORAGE_KEY) return;
			setThemeState(readStoredTheme(browserStorage()));
		};
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	const setTheme = useCallback((next: Theme) => {
		if (!isTheme(next)) return;
		setThemeState(next);
		try {
			browserStorage()?.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// The theme still applies for this session when storage is blocked.
		}
	}, []);

	const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used within a ThemeProvider");
	return context;
};
