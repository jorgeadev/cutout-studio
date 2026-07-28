import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export const ThemeToggle = () => {
	const { resolvedTheme, setTheme } = useTheme();
	const dark = resolvedTheme === "dark";

	return (
		<Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
			{dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
		</Button>
	);
};
