import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./enterprise.css";
import { initializePwa } from "./lib/pwa";
initializePwa(import.meta.env.BASE_URL, import.meta.env.PROD);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
