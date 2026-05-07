/**
 * Monaco Editor environment setup for Vite + Tauri.
 *
 * Bundles language workers locally using Vite's ?worker import so the editor
 * works offline inside the Tauri WebView (no CDN required).
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Vite bundles each worker into a separate chunk automatically
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string): Worker {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// Point @monaco-editor/react to the local monaco instance
loader.config({ monaco });
