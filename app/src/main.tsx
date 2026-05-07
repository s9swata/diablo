import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/* Self-hosted fonts for offline Tauri WebView */
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
