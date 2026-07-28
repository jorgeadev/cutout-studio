import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("class name merging", () => {
	it("combines conditional classes and resolves Tailwind conflicts", () => {
		expect(cn("px-2", false && "hidden", "px-4", { block: true, flex: false })).toBe("px-4 block");
	});
});
