import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CompareSliderProps } from "@/types/compare";

export const CompareSlider = ({ originalUrl, cutoutUrl, backgroundCss, alt, className }: CompareSliderProps) => {
	const [position, setPosition] = useState(50);
	const containerRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);

	const updateFromClientX = useCallback((clientX: number) => {
		const el = containerRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const pct = ((clientX - rect.left) / rect.width) * 100;
		setPosition(Math.max(0, Math.min(100, pct)));
	}, []);

	return (
		<div
			ref={containerRef}
			className={cn("group relative touch-none select-none overflow-hidden rounded-lg border border-border bg-muted", className)}
			onPointerDown={(event) => {
				draggingRef.current = true;
				event.currentTarget.setPointerCapture(event.pointerId);
				updateFromClientX(event.clientX);
			}}
			onPointerMove={(event) => {
				if (!draggingRef.current) return;
				updateFromClientX(event.clientX);
			}}
			onPointerUp={(event) => {
				draggingRef.current = false;
				event.currentTarget.releasePointerCapture(event.pointerId);
			}}
			onPointerCancel={() => {
				draggingRef.current = false;
			}}
		>
			{/* Original */}
			<img src={originalUrl || "/placeholder.svg"} alt={`Original ${alt}`} className="h-full w-full object-contain" />

			{/* Processed, revealed from the divider to the right edge */}
			<div
				className={cn("absolute inset-0", backgroundCss ? null : "checkerboard")}
				style={{
					clipPath: `inset(0 0 0 ${position}%)`,
					background: backgroundCss ?? undefined,
				}}
			>
				<img src={cutoutUrl || "/placeholder.svg"} alt={`Background removed ${alt}`} className="h-full w-full object-contain" />
			</div>

			{/* Labels */}
			<span className="pointer-events-none absolute left-2 top-2 rounded-md bg-foreground/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-background">
				Before
			</span>
			<span className="pointer-events-none absolute right-2 top-2 rounded-md bg-foreground/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-background">
				After
			</span>

			{/* Vertical reveal line + handle */}
			<div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${position}%` }}>
				<div
					role="slider"
					tabIndex={0}
					aria-label={`Reveal amount for ${alt}`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(position)}
					onKeyDown={(event) => {
						if (event.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 4));
						if (event.key === "ArrowRight") setPosition((p) => Math.min(100, p + 4));
						if (event.key === "Home") setPosition(0);
						if (event.key === "End") setPosition(100);
					}}
					className="pointer-events-auto absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ChevronLeft className="size-3.5" aria-hidden="true" />
					<ChevronRight className="size-3.5" aria-hidden="true" />
				</div>
			</div>
		</div>
	);
};
