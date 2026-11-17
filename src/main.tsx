import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./enterprise.css";
import { initializePwa } from "./lib/pwa";
import { completeGoogleLogin } from "./lib/googleLogin";
import { initialPasswordReturn } from "./lib/client";
initializePwa(import.meta.env.BASE_URL, import.meta.env.PROD);
void completeGoogleLogin().then((authNotice) => {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App authNotice={authNotice} initialRecovery={initialPasswordReturn} />
    </React.StrictMode>,
  );
});
