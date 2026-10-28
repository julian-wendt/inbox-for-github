import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";

interface State {
  error: Error | null;
  stack: string;
}

/**
 * Catches a render error anywhere below it and shows a calm page instead of a blank or frozen
 * window: what happened, a button to reload the app, and the error details to copy for a report.
 * Local data is untouched; reloading starts from the stored statuses and cache.
 *
 * @example
 *   <ErrorBoundary><App /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: `${error.stack ?? error.message}\n\nComponent stack:${info.componentStack ?? ""}` });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash" data-tauri-drag-region>
        <h1>{t("crash.title")}</h1>
        <p>{t("crash.text")}</p>
        <div className="crash-actions">
          <button className="btn success" onClick={() => window.location.reload()}>
            {t("crash.reload")}
          </button>
          <button className="btn" onClick={() => void navigator.clipboard.writeText(stack || error.message)}>
            {t("crash.copy")}
          </button>
        </div>
        <details>
          <summary>{error.message}</summary>
          <pre>{stack}</pre>
        </details>
      </main>
    );
  }
}
