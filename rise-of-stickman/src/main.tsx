import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RiseOfStickman from "./game/RiseOfStickman";
import "./page.css";
import { reloadIfStale } from "../../shared/autoUpdate";

reloadIfStale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RiseOfStickman />
  </StrictMode>,
);
