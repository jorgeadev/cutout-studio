import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { ErrorBoundary, recordFatalError } from "@/components/error-boundary";
import "@/styles/index.css";

const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element was not found");
}

// Capture crashes before React can show them so the error boundary
// (and future sessions) can explain what happened instead of reloading blind.
window.addEventListener("error", (event) => {
	recordFatalError(event.error instanceof Error ? event.error.message : event.message || "Unknown runtime error");
});
window.addEventListener("unhandledrejection", (event) => {
	const reason = event.reason;
	recordFatalError(reason instanceof Error ? reason.message : "Unhandled promise rejection");
});

// Ask the browser to keep local storage (model cache) through memory pressure.
const requestPersistentStorage = async () => {
	try {
		await navigator.storage?.persist?.();
	} catch {
		// Persistence is a best-effort enhancement.
	}
};
void requestPersistentStorage();

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</StrictMode>,
);