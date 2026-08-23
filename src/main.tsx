
/**
 * React Application Entry Point
 * Mounts the root React component (<App />) to the DOM root element and imports global Tailwind CSS styles.
 */

import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(<App />);
  