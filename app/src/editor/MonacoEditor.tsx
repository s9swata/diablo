import { useRef, useEffect, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { useGitStore } from "../store/git";
import { lspClient, monacoLangToLsp } from "./lspClient";
import { registerHoverProvider } from "./providers/hover";
import { registerCompletionProvider } from "./providers/completions";
import { registerInlineCompletionProvider } from "./providers/inlineCompletions";
import { registerDefinitionProvider } from "./providers/definitions";
import { registerDiagnosticsHandler } from "./providers/diagnostics";
import type * as Monaco from "monaco-editor";

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

const LANG_DISPLAY: Record<string, string> = {
  typescript: "TypeScript",
  typescriptreact: "TSX",
  javascript: "JavaScript",
  rust: "Rust",
  python: "Python",
  go: "Go",
  json: "JSON",
  markdown: "Markdown",
  toml: "TOML",
  html: "HTML",
  css: "CSS",
  shell: "Shell",
  plaintext: "Plain Text",
};

let providersRegistered = false;
let gutterStylesInjected = false;

interface LineAnnotation {
  line: number;
  type: "added" | "modified" | "deleted";
}

function parseDiff(diff: string): LineAnnotation[] {
  const annotations: LineAnnotation[] = [];
  const lines = diff.split("\n");
  let newLine = 0;
  let pendingRemoves = 0;
  let pendingAdds: number[] = [];

  function flush() {
    const modifiedCount = Math.min(pendingRemoves, pendingAdds.length);
    pendingAdds.forEach((l, i) => {
      annotations.push({ line: l, type: i < modifiedCount ? "modified" : "added" });
    });
    if (pendingRemoves > pendingAdds.length && pendingAdds.length === 0) {
      // Pure deletion — mark at the surrounding context line (already emitted)
      // We'll mark the line just before the deletion block
      if (annotations.length > 0) {
        annotations.push({ line: newLine, type: "deleted" });
      }
    }
    pendingRemoves = 0;
    pendingAdds = [];
  }

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flush();
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) newLine = parseInt(m[1], 10);
    } else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) {
      // diff header lines — skip
    } else if (line.startsWith("+")) {
      pendingAdds.push(newLine);
      newLine++;
    } else if (line.startsWith("-")) {
      pendingRemoves++;
    } else {
      flush();
      if (!line.startsWith("\\")) newLine++;
    }
  }
  flush();

  return annotations;
}

interface Props {
  onCursorChange: (pos: { line: number; col: number } | null) => void;
  onLanguageChange: (lang: string | null) => void;
}

export function MonacoEditor({ onCursorChange, onLanguageChange }: Props) {
  const { openFiles, activeFile, settings, updateContent, markSaved, workspaceRoot } = useEditorStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monacoInstance = useMonaco();
  const openedFiles = useRef<Set<string>>(new Set());
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const gitDecorationIds = useRef<string[]>([]);
  const { status: gitStatus } = useGitStore();

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

  // Inject git gutter CSS once
  useEffect(() => {
    if (gutterStylesInjected) return;
    gutterStylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .git-gutter-added { background: #3fb950; width: 3px !important; margin-left: 2px; }
      .git-gutter-modified { background: #e3b341; width: 3px !important; margin-left: 2px; }
      .git-gutter-deleted { border-top: 3px solid #f85149; width: 8px !important; margin-left: 2px; }
    `;
    document.head.appendChild(style);
  }, []);

  // Apply git gutter decorations when active file or git status changes
  const applyGutterDecorations = useCallback(async () => {
    const editor = editorRef.current;
    const monaco = monacoInstance;
    if (!editor || !monaco || !activeFile || !workspaceRoot) {
      if (editor) {
        gitDecorationIds.current = editor.deltaDecorations(gitDecorationIds.current, []);
      }
      return;
    }
    try {
      const diff = await invoke<string>("git_diff_file", {
        cwd: workspaceRoot,
        path: activeFile,
        staged: false,
      });
      const annotations = parseDiff(diff);
      const decorations = annotations.map(({ line, type }) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: `git-gutter-${type}`,
          overviewRuler: {
            color: type === "added" ? "#3fb950" : type === "modified" ? "#e3b341" : "#f85149",
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      }));
      gitDecorationIds.current = editor.deltaDecorations(gitDecorationIds.current, decorations);
    } catch {
      gitDecorationIds.current = editor.deltaDecorations(gitDecorationIds.current, []);
    }
  }, [activeFile, workspaceRoot, monacoInstance]);

  useEffect(() => {
    gitDecorationIds.current = [];
    applyGutterDecorations();
  }, [activeFile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyGutterDecorations();
  }, [gitStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onGitRefresh = () => applyGutterDecorations();
    window.addEventListener("git-refresh", onGitRefresh);
    return () => window.removeEventListener("git-refresh", onGitRefresh);
  }, [applyGutterDecorations]);

  // Update language display when active file changes
  useEffect(() => {
    if (!file) {
      onLanguageChange(null);
      onCursorChange(null);
      return;
    }
    const lang = langFromPath(file.path);
    onLanguageChange(LANG_DISPLAY[lang] ?? lang);
  }, [file?.path]); // eslint-disable-line react-hooks/exhaustive-deps

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
        window.dispatchEvent(new CustomEvent("git-refresh"));
      }, 500);
    },
    [activeFile, updateContent, markSaved]
  );

  useEffect(() => {
    function onCmd(e: Event) {
      const action = (e as CustomEvent<string>).detail;
      editorRef.current?.trigger("menu", action, null);
      editorRef.current?.focus();
    }
    function onGoto(e: Event) {
      const { line, col } = (e as CustomEvent<{ line: number; col: number }>).detail;
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: col });
      editor.focus();
    }
    window.addEventListener("editor-cmd", onCmd);
    window.addEventListener("editor-goto", onGoto);
    return () => {
      window.removeEventListener("editor-cmd", onCmd);
      window.removeEventListener("editor-goto", onGoto);
    };
  }, []);

  function handleEditorMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange({ line: e.position.lineNumber, col: e.position.column });
    });
  }

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
      onMount={handleEditorMount}
      options={{
        fontSize: settings.fontSize,
        tabSize: settings.tabSize,
        minimap: { enabled: settings.minimap },
        scrollBeyondLastLine: false,
        wordWrap: settings.wordWrap,
        renderWhitespace: "none",
        lineNumbersMinChars: 3,
        fixedOverflowWidgets: true,
        inlineSuggest: { enabled: true, mode: "prefix" },
      }}
    />
  );
}
