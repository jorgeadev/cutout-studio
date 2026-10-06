import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

const Probe = () => {
	const { theme, resolvedTheme } = useTheme();
	return (
		<span>
			{theme}:{resolvedTheme}
		</span>
	);
};

describe("ThemeProvider", () => {
	it("provides the system default while rendering without a DOM", () => {
		const markup = renderToStaticMarkup(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		);
		expect(markup).toContain("system:light");
	});

	it("requires a provider", () => {
		expect(() => renderToStaticMarkup(<Probe />)).toThrow("within a ThemeProvider");
	});
});
