import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { Studio } from "@/components/studio/studio";
import { Toaster } from "@/components/ui/sonner";

export const App = () => {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="cutout-studio-theme">
			<Studio />
			<Toaster position="top-center" closeButton />
			<ServiceWorkerRegistrar />
			{import.meta.env.PROD ? <Analytics /> : null}
		</ThemeProvider>
	);
};
