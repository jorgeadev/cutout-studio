import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export const ThemeToggle = () => {
	const { resolvedTheme, setTheme } = useTheme();
	const dark = resolvedTheme === "dark";

	return (
		<Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
			{dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
		</Button>
	);
};
