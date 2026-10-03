import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/jua/latin-400.css";
import "@fontsource/jua/korean-400.css";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
