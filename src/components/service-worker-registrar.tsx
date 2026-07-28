import { useEffect } from "react";

export const ServiceWorkerRegistrar = () => {
	useEffect(() => {
		if (!import.meta.env.PROD) return;
		if (!("serviceWorker" in navigator)) return;

		const register = () => {
			navigator.serviceWorker.register("/sw.js").catch(() => {
				// Offline support is a progressive enhancement.
			});
		};

		if (document.readyState === "complete") register();
		else window.addEventListener("load", register);

		return () => window.removeEventListener("load", register);
	}, []);

	return null;
};
