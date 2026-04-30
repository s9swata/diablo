import { useRef, useEffect, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { lspClient, monacoLangToLsp } from "./lspClient";
import { registerHoverProvider } from "./providers/hover";
import { registerCompletionProvider } from "./providers/completions";
import { registerInlineCompletionProvider } from "./providers/inlineCompletions";
import { registerDefinitionProvider } from "./providers/definitions";
import { registerDiagnosticsHandler } from "./providers/diagnostics";

export function langFromPath(path: string): string {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact",
    js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", go: "go",
    json: "json", md: "markdown", toml: "toml",
    html: "html", css: "css", sh: "shell",
  };
  return map[ext] ?? "plaintext";
}

let providersRegistered = false;

export function MonacoEditor() {
  const { openFiles, activeFile, settings, updateContent, markSaved } = useEditorStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monacoInstance = useMonaco();
  const openedFiles = useRef<Set<string>>(new Set());

  const file = openFiles.find((f) => f.path === activeFile);

  // Register LSP providers once when Monaco is ready
  useEffect(() => {
    if (!monacoInstance || providersRegistered) return;
    providersRegistered = true;
    registerHoverProvider(monacoInstance);
    registerCompletionProvider(monacoInstance);
    registerInlineCompletionProvider(monacoInstance);
    registerDefinitionProvider(monacoInstance);
    registerDiagnosticsHandler(monacoInstance);
  }, [monacoInstance]);

  // Send textDocument/didOpen when a new file becomes active
  useEffect(() => {
    if (!file || openedFiles.current.has(file.path)) return;
    openedFiles.current.add(file.path);

    const lang = monacoLangToLsp(langFromPath(file.path));
    const uri = `file://${file.path}`;
    lspClient.ensureStarted(lang).then((serverId) => {
      if (!serverId) return;
      lspClient.notify(serverId, "textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: lang,
          version: lspClient.getNextVersion(uri),
          text: file.content,
        },
      });
    });
  }, [file?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile || value === undefined) return;
      updateContent(activeFile, value);

      // Notify LSP of content change
      const lang = monacoLangToLsp(langFromPath(activeFile));
      const uri = `file://${activeFile}`;
      lspClient.ensureStarted(lang).then((serverId) => {
        if (!serverId) return;
        lspClient.notify(serverId, "textDocument/didChange", {
          textDocument: { uri, version: lspClient.getNextVersion(uri) },
          contentChanges: [{ text: value }],
        });
      });

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await invoke("fs_write", { path: activeFile, content: value });
        markSaved(activeFile);
      }, 500);
    },
    [activeFile, updateContent, markSaved]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (!file) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontSize: 13,
        }}
      >
        Open a file to start editing
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={file.path}
      language={langFromPath(file.path)}
      value={file.content}
      theme={settings.theme}
      onChange={handleChange}
      options={{
        fontSize: settings.fontSize,
        tabSize: settings.tabSize,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "off",
        renderWhitespace: "none",
        lineNumbersMinChars: 3,
        inlineSuggest: { enabled: true, mode: "prefix" },
      }}
    />
  );
}
