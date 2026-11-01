import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { Editor } from "./editor";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Editor />
    </StrictMode>,
  );
