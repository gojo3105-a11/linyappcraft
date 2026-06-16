import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import config from "../granite.config.ts";
import App from "./App.tsx";
import "./index.css";

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

  const { TDSMobileAITProvider } = await import("@toss/tds-mobile-ait");
  root.render(
    <StrictMode>
      <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
        <App />
      </TDSMobileAITProvider>
    </StrictMode>,
  );
}

init();
