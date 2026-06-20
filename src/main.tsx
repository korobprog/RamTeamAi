import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, readInitialThemePref } from "./lib/theme";
import "./assets/tabler/tabler-icons.min.css";
import "./styles.css";

// Apply the saved theme before the first paint to avoid a flash of the wrong palette.
applyTheme(readInitialThemePref());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
