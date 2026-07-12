import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/UI/AppErrorBoundary";
import { I18nProvider } from "./i18n/I18nProvider";
import { installGlobalErrorLogging } from "./utils/appLog";
import { installNativeDialogPolyfill } from "./utils/nativeDialog";

// Install as early as possible — before first paint / first invoke.
installNativeDialogPolyfill();
installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <I18nProvider>
      <App />
    </I18nProvider>
  </AppErrorBoundary>,
);