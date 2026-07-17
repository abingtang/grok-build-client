import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import "./styles/globals.css";
import "./styles/app.css";
import "./styles/highlight.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <div className="dark h-full">
        <App />
      </div>
    </I18nProvider>
  </React.StrictMode>,
);