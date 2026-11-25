import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./shell.css";
import "./galaxy.css";
import App from "./App.jsx";
import { hydrateStoreFromUrl } from "./utils/urlSync";

// Route before first paint so /explore/* does not boot Galaxy heavy assets
hydrateStoreFromUrl();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
