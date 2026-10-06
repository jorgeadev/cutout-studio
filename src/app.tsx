import { Analytics } from "@vercel/analytics/react";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { Studio } from "@/components/studio/studio";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export const App = () => {
	return (
		<ThemeProvider>
			<Studio />
			<Toaster position="top-center" closeButton />
			<ServiceWorkerRegistrar />
			{import.meta.env.PROD ? <Analytics /> : null}
		</ThemeProvider>
	);
};
