import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { coreRuntime } from "./core";

// Cleanup runtime resources on app unload.
window.addEventListener("beforeunload", () => {
  void coreRuntime.shutdown();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
