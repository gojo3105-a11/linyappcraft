import { Component, StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

class TossProviderBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    return this.state.crashed ? <App /> : this.props.children;
  }
}

async function init() {
  const root = createRoot(document.getElementById("root")!);

  if (import.meta.env.DEV) {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    return;
  }

  try {
    const [{ default: config }, { TDSMobileAITProvider }] = await Promise.all([
      import("../granite.config.ts"),
      import("@toss/tds-mobile-ait"),
    ]);
    root.render(
      <StrictMode>
        <TossProviderBoundary>
          <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
            <App />
          </TDSMobileAITProvider>
        </TossProviderBoundary>
      </StrictMode>,
    );
  } catch {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

init();
