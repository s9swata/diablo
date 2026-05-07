import { useRef, useEffect, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, openSearchPanel } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { useGitStore } from "../store/git";
import { lspClient, monacoLangToLsp } from "./lspClient";
import { langFromPath } from "./language";
import { themeExtension } from "./extensions/theme";
import { gitGutterExtension, setGitAnnotations, LineAnnotation } from "./extensions/gitGutter";
import { lspCompletionsExtension } from "./extensions/completions";
import { diagnosticsExtension, registerDiagnosticsView, unregisterDiagnosticsView, registerPushDiagnosticsHandler, pullDiagnostics } from "./extensions/diagnostics";
import { lspHoverExtension } from "./extensions/hover";
import { lspDefinitionsExtension } from "./extensions/definitions";
import { lspCodeActionsExtension } from "./extensions/codeActions";
import { lspSignatureHelpExtension } from "./extensions/signatureHelp";
import { inlineCompletionsExtension } from "./extensions/inlineCompletions";

// Register push diagnostics handler once globally
registerPushDiagnosticsHandler();

interface Props {
  onCursorChange: (pos: { line: number; col: number } | null) => void;
  onLanguageChange: (lang: string | null) => void;
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
      if (annotations.length > 0) annotations.push({ line: newLine, type: "deleted" });
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
      // skip
    } else if (line.startsWith("+")) {
      pendingAdds.push(newLine++);
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

export function CodeMirrorEditor({ onCursorChange, onLanguageChange }: Props) {
  const { openFiles, activeFile, settings, updateContent, markSaved, workspaceRoot } = useEditorStore();
  const { status: gitStatus } = useGitStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-file EditorState cache — preserves undo history and cursor on tab switch
  const stateCache = useRef<Map<string, EditorState>>(new Map());
  const activeFileRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const file = openFiles.find((f) => f.path === activeFile) ?? null;

  // Build a fresh EditorState for a given file
  const buildState = useCallback((path: string, content: string): EditorState => {
    const langInfo = langFromPath(path);
    const lspId = monacoLangToLsp(langInfo.lspId);
    const getLspId = () => monacoLangToLsp(langFromPath(activeFileRef.current ?? "").lspId);
    const getFilePath = () => activeFileRef.current ?? "";

    const extensions = [
      // Base editing
      history(),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      lineNumbers(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap,
        ...searchKeymap,
        indentWithTab,
      ]),

      // Settings
      indentUnit.of(" ".repeat(settingsRef.current.tabSize)),
      ...(settingsRef.current.wordWrap === "on" ? [EditorView.lineWrapping] : []),

      // Theme
      themeExtension(settingsRef.current.theme),

      // Language
      ...(langInfo.support ? [langInfo.support] : []),

      // Git gutter
      ...gitGutterExtension(),

      // LSP features
      lspCompletionsExtension(getLspId, getFilePath),
      diagnosticsExtension(),
      lspHoverExtension(getLspId, getFilePath),
      lspDefinitionsExtension(getLspId, getFilePath),
      lspCodeActionsExtension(getLspId, getFilePath),
      lspSignatureHelpExtension(getLspId, getFilePath),
      inlineCompletionsExtension(getLspId),

      // Content change listener
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const currentPath = activeFileRef.current;
        if (!currentPath) return;
        const value = update.state.doc.toString();
        updateContent(currentPath, value);

        // LSP didChange
        const currentLang = monacoLangToLsp(langFromPath(currentPath).lspId);
        const uri = `file://${currentPath}`;
        lspClient.ensureStarted(currentLang, currentPath).then((serverId) => {
          if (!serverId) return;
          lspClient.notify(serverId, "textDocument/didChange", {
            textDocument: { uri, version: lspClient.getNextVersion(uri) },
            contentChanges: [{ text: value }],
          });
          if (viewRef.current) pullDiagnostics(viewRef.current, serverId, uri).catch(() => {});
        });

        // Auto-save debounce
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          await invoke("fs_write", { path: currentPath, content: value });
          markSaved(currentPath);
          window.dispatchEvent(new CustomEvent("git-refresh"));
        }, 500);

        // Cursor tracking
        const sel = update.state.selection.main;
        const line = update.state.doc.lineAt(sel.head);
        onCursorChange({ line: line.number, col: sel.head - line.from + 1 });
      }),

      // Cursor position tracking (without doc change)
      EditorView.updateListener.of((update) => {
        if (update.selectionSet && !update.docChanged) {
          const sel = update.state.selection.main;
          const line = update.state.doc.lineAt(sel.head);
          onCursorChange({ line: line.number, col: sel.head - line.from + 1 });
        }
      }),

      EditorView.theme({
        "&": { height: "100%", fontSize: `${settingsRef.current.fontSize}px` },
        ".cm-scroller": { overflow: "auto", fontFamily: "'GeistMono', monospace" },
      }),
    ];

    // Start LSP server for this file
    lspClient.ensureStarted(lspId, path).then((serverId) => {
      if (!serverId) return;
      const uri = `file://${path}`;
      lspClient.notify(serverId, "textDocument/didOpen", {
        textDocument: { uri, languageId: lspId, version: lspClient.getNextVersion(uri), text: content },
      });
    });

    return EditorState.create({ doc: content, extensions });
  }, [updateContent, markSaved, onCursorChange]);

  // Create editor view on mount
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    const view = new EditorView({ parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Switch state when activeFile changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !file) return;

    // Save current state before switching
    if (activeFileRef.current && activeFileRef.current !== file.path) {
      stateCache.current.set(activeFileRef.current, view.state);
      // Unregister diagnostics for old file
      unregisterDiagnosticsView(`file://${activeFileRef.current}`);
    }

    activeFileRef.current = file.path;

    // Restore cached state or create new
    let newState = stateCache.current.get(file.path);
    if (!newState) {
      newState = buildState(file.path, file.content);
    }

    view.setState(newState);
    view.focus();

    // Register diagnostics view for new file
    registerDiagnosticsView(`file://${file.path}`, view);

    // Update language display
    const langInfo = langFromPath(file.path);
    onLanguageChange(langInfo.displayName);
    onCursorChange({ line: 1, col: 1 });
  }, [activeFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply settings changes dynamically (theme, fontSize, wordWrap, tabSize)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Rebuild state with new settings — preserves doc content
    const currentPath = activeFileRef.current;
    if (!currentPath) return;
    const content = view.state.doc.toString();
    stateCache.current.delete(currentPath); // force rebuild
    const newState = buildState(currentPath, content);
    view.setState(newState);
    if (activeFile) registerDiagnosticsView(`file://${activeFile}`, view);
  }, [settings.theme, settings.fontSize, settings.wordWrap, settings.tabSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Git gutter decorations
  const applyGutterDecorations = useCallback(async () => {
    const view = viewRef.current;
    if (!view || !activeFile || !workspaceRoot) {
      viewRef.current?.dispatch({ effects: setGitAnnotations.of([]) });
      return;
    }
    try {
      const diff = await invoke<string>("git_diff_file", { cwd: workspaceRoot, path: activeFile, staged: false });
      view.dispatch({ effects: setGitAnnotations.of(parseDiff(diff)) });
    } catch {
      view.dispatch({ effects: setGitAnnotations.of([]) });
    }
  }, [activeFile, workspaceRoot]);

  useEffect(() => { applyGutterDecorations(); }, [activeFile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyGutterDecorations(); }, [gitStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onGitRefresh = () => applyGutterDecorations();
    window.addEventListener("git-refresh", onGitRefresh);
    return () => window.removeEventListener("git-refresh", onGitRefresh);
  }, [applyGutterDecorations]);

  // editor-cmd and editor-goto window events
  useEffect(() => {
    function onCmd(e: Event) {
      const view = viewRef.current;
      if (!view) return;
      const action = (e as CustomEvent<string>).detail;
      if (action === "actions.find" || action === "editor.action.startFindReplaceAction") {
        openSearchPanel(view);
      }
      view.focus();
    }
    function onGoto(e: Event) {
      const view = viewRef.current;
      if (!view) return;
      const { line, col } = (e as CustomEvent<{ line: number; col: number }>).detail;
      try {
        const lineObj = view.state.doc.line(line);
        const pos = lineObj.from + Math.max(0, col - 1);
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        view.focus();
      } catch {}
    }
    window.addEventListener("editor-cmd", onCmd);
    window.addEventListener("editor-goto", onGoto);
    return () => {
      window.removeEventListener("editor-cmd", onCmd);
      window.removeEventListener("editor-goto", onGoto);
    };
  }, []);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  if (!file) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>
        Open a file to start editing
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}
      className="cm-editor-container"
    />
  );
}
