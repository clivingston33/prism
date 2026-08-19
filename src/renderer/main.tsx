import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "./index.css";
import { App } from "./app";

const root = document.getElementById("root");
if (!root) throw new Error("Renderer root element is missing.");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
