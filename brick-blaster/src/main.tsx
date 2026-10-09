import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BrickBlaster from "./game/BrickBlaster";
import "./page.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="page">
      <a className="home" href="../">
        ← All games
      </a>
      <BrickBlaster />
    </main>
  </StrictMode>,
);
