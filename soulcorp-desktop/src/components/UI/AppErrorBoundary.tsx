import { Component, type ErrorInfo, type ReactNode } from "react";
import { isDevHmrNoise, logClientError } from "../../utils/appLog";
import { languageFromSettings, translate } from "../../i18n";
import { useGameStore } from "../../stores/gameStore";

function t(key: string, params?: Record<string, string | number | undefined | null>): string {
  try {
    return translate(languageFromSettings(useGameStore.getState().settings), key, params);
  } catch {
    return translate("en", key, params);
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches React render/lifecycle errors that never become window.error
 * or unhandledrejection, and records them in app_logs.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const message = error.message || t("errorBoundary.logMsg");
    // Vite HMR often throws "Importing a module script failed" mid-reload — not a product bug.
    if (isDevHmrNoise(message)) {
      return;
    }
    void logClientError(
      "ui",
      "react_error_boundary",
      message,
      [error.stack, info.componentStack].filter(Boolean).join("\n\n"),
    );
  }

  private handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary" role="alert">
        <div className="app-error-boundary-card">
          <p className="workflow-step-badge">{t("errorBoundary.badge")}</p>
          <h2>{t("errorBoundary.title")}</h2>
          <p className="muted">{t("errorBoundary.desc")}</p>
          <pre className="app-error-boundary-detail">{error.message}</pre>
          <div className="app-error-boundary-actions">
            <button type="button" className="btn primary" onClick={this.handleReload}>
              {t("errorBoundary.reload")}
            </button>
            <button type="button" className="btn" onClick={this.handleDismiss}>
              {t("errorBoundary.continue")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
