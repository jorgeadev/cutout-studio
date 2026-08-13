import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LAST_ERROR_KEY = "cutout-studio-last-error";

export const recordFatalError = (message: string): void => {
	try {
		window.sessionStorage.setItem(LAST_ERROR_KEY, message.slice(0, 500));
	} catch {
		// sessionStorage can be unavailable; the fallback UI still explains what happened.
	}
};

interface ErrorBoundaryState {
	error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
	state: ErrorBoundaryState = {};

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, _info: ErrorInfo): void {
		recordFatalError(error.message);
	}

	private handleRecover = (): void => {
		try {
			window.sessionStorage.removeItem(LAST_ERROR_KEY);
		} catch {
			// ignore
		}
		this.setState({ error: undefined });
	};

	render() {
		if (!this.state.error) return this.props.children;

		let detail = this.state.error.message;
		try {
			detail ||= window.sessionStorage.getItem(LAST_ERROR_KEY) ?? "";
		} catch {
			// ignore
		}

		return (
			<div className="flex min-h-dvh items-center justify-center bg-background p-4">
				<Card className="w-full max-w-md">
					<CardHeader>
						<span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
							<AlertTriangle className="size-5" aria-hidden="true" />
						</span>
						<CardTitle className="mt-3">Something went wrong</CardTitle>
						<CardDescription>
							The app hit an unexpected problem. Your images were never uploaded; reloading restores the workspace.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{detail ? (
							<p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground" role="alert">
								{detail}
							</p>
						) : null}
						<div className="flex flex-wrap gap-2">
							<Button type="button" onClick={this.handleRecover}>
								<RotateCcw data-icon="inline-start" aria-hidden="true" />
								Try again
							</Button>
							<Button type="button" variant="outline" onClick={() => window.location.reload()}>
								<RefreshCw data-icon="inline-start" aria-hidden="true" />
								Reload app
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}
}