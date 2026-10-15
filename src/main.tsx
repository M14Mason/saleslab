import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Hash routing: GitHub Pages serves one static file, so deep links like #/history always work.
// StrictMode is intentionally off: its double-mounted effects would start the mic and audio twice in dev.
createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
