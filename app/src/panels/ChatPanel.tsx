import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentStore, ChatMode } from "../store/agent";
import { useEditorStore } from "../store/editor";
import { buildContext } from "../agent/context";
import { parseSearchReplace, applyAllBlocks } from "../agent/applyParser";
import { GATEWAY_URL } from "../config";
import { Button } from "../ui/primitives";

const API_KEY_STORAGE = "diablo_api_key";

function loadKey(): string {
  try { return localStorage.getItem(API_KEY_STORAGE) ?? ""; } catch { return ""; }
}
function saveKey(k: string) {
  try { localStorage.setItem(API_KEY_STORAGE, k); } catch {}
}

// ─── SSE token extractor ──────────────────────────────────────────────────────

function extractToken(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6).trim();
  if (payload === "[DONE]") return null;
  try {
    const json = JSON.parse(payload);
    return (
      json?.choices?.[0]?.delta?.content ??
      json?.response ??
      null
    );
  } catch {
    return null;
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: "90%",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: isUser ? "var(--color-primary, #2563eb)" : "var(--color-bg-sidebar, #1e1e1e)",
          color: isUser ? "#fff" : "var(--color-text-main, #d4d4d4)",
          border: isUser ? "none" : "1px solid var(--color-border-subtle, #333)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

// ─── Mode pill ────────────────────────────────────────────────────────────────

const MODES: { value: ChatMode; label: string; desc: string }[] = [
  { value: "ask", label: "Ask", desc: "Read-only Q&A" },
  { value: "edit", label: "Edit", desc: "Edit current file" },
  { value: "agent", label: "Agent", desc: "Multi-file agent" },
];

// ─── ApiKey setup ─────────────────────────────────────────────────────────────

function ApiKeySetup({ onSave }: { onSave: (k: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderBottom: "1px solid var(--color-border-subtle, #333)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--color-text-muted, #888)" }}>
        Gateway API key required
      </div>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="sk-..."
        type="password"
        className="bg-bg-sidebar border border-border-subtle rounded-sm text-white text-[12px] outline-none focus:border-text-muted"
        style={{ padding: "4px 8px" }}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); }}
      />
      <Button onClick={() => { if (val.trim()) onSave(val.trim()); }} style={{ alignSelf: "flex-end" }}>
        Save Key
      </Button>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(loadKey);
  const {
    messages,
    mode,
    streaming,
    setMode,
    addMessage,
    appendToLastAssistant,
    setStreaming,
    clearMessages,
    setPendingDiffs,
  } = useAgentStore();
  const { activeFile, openFiles } = useEditorStore();
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSaveKey(k: string) {
    saveKey(k);
    setApiKey(k);
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: text };
    addMessage(userMsg);
    setStreaming(true);

    try {
      const context = await buildContext(mode);
      const systemInjection = context
        ? `<context>\n${context}\n</context>\n\n`
        : "";

      const historyMessages = messages
        .concat(userMsg)
        .map((m) => ({
          role: m.role,
          content: m.role === "user" && m.id === userMsg.id
            ? systemInjection + m.content
            : m.content,
        }));

      abortRef.current = new AbortController();

      const res = await fetch(`${GATEWAY_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ messages: historyMessages, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => res.statusText);
        appendToLastAssistant(`Error ${res.status}: ${errText}`);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const token = extractToken(line.trim());
          if (token) {
            appendToLastAssistant(token);
            fullResponse += token;
          }
        }
      }

      // Process any remaining buffer
      if (buffer) {
        const token = extractToken(buffer.trim());
        if (token) {
          appendToLastAssistant(token);
          fullResponse += token;
        }
      }

      // Parse SEARCH/REPLACE blocks and build pending diffs
      if (mode !== "ask" && activeFile) {
        const blocks = parseSearchReplace(fullResponse);
        if (blocks.length > 0) {
          const file = openFiles.find((f) => f.path === activeFile);
          if (file) {
            const patched = applyAllBlocks(file.content, blocks);
            if (patched !== null) {
              setPendingDiffs([{ path: activeFile, original: file.content, patched }]);
            } else {
              appendToLastAssistant(
                "\n\n⚠️ Could not apply patch: SEARCH text not found in current file.",
              );
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        appendToLastAssistant(`\n\nError: ${(err as Error)?.message ?? String(err)}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, mode, messages, apiKey, activeFile, openFiles, addMessage, appendToLastAssistant, setStreaming, setPendingDiffs]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  const hasApiKey = apiKey.length > 0;

  return (
    <div
      className="flex flex-col bg-bg-sidebar border-l border-border-subtle overflow-hidden"
      style={{ width: 340, height: "100%" }}
    >
      {/* Header */}
      <div
        className="flex items-center border-b border-border-subtle shrink-0"
        style={{ padding: "6px 10px", gap: 6 }}
      >
        <span className="text-[12px] text-text-main font-semibold flex-1">Chat</span>
        <button
          onClick={clearMessages}
          title="Clear conversation"
          className="text-text-muted hover:text-text-main transition-colors text-[11px]"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
        >
          Clear
        </button>
        <button
          onClick={onClose}
          title="Close chat"
          className="text-text-muted hover:text-text-main transition-colors"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
        >
          ×
        </button>
      </div>

      {/* API key setup */}
      {!hasApiKey && <ApiKeySetup onSave={handleSaveKey} />}

      {/* Mode switcher */}
      <div
        className="flex shrink-0 border-b border-border-subtle"
        style={{ padding: "4px 8px", gap: 4 }}
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.desc}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              borderRadius: 3,
              cursor: "pointer",
              border: "none",
              background: mode === m.value ? "var(--color-primary, #2563eb)" : "transparent",
              color: mode === m.value ? "#fff" : "var(--color-text-muted, #888)",
              transition: "background 0.15s",
            }}
          >
            {m.label}
          </button>
        ))}
        {activeFile && (
          <span
            className="text-text-muted"
            style={{
              fontSize: 10,
              marginLeft: "auto",
              alignSelf: "center",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={activeFile}
          >
            {activeFile.split("/").pop()}
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "12px 10px" }}
      >
        {messages.length === 0 && (
          <div
            className="text-text-muted text-center select-none"
            style={{ fontSize: 11, marginTop: 24 }}
          >
            {mode === "ask" && "Ask anything about your code."}
            {mode === "edit" && "Describe the change to make in the current file."}
            {mode === "agent" && "Describe a task. Agent can read and edit files."}
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {streaming && (
          <div
            className="text-text-muted"
            style={{ fontSize: 11, marginBottom: 8 }}
          >
            <span className="animate-pulse">●</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 border-t border-border-subtle"
        style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasApiKey ? "Message… (Enter to send, Shift+Enter for newline)" : "Set API key above to chat"}
          disabled={!hasApiKey}
          rows={3}
          className="bg-bg-app border border-border-subtle rounded-sm text-white text-[12px] outline-none focus:border-text-muted resize-none"
          style={{ padding: "6px 8px", lineHeight: 1.5, width: "100%" }}
        />
        <div className="flex justify-end" style={{ gap: 6 }}>
          {streaming ? (
            <Button variant="danger" onClick={stopStreaming} style={{ fontSize: 11, padding: "3px 10px" }}>
              Stop
            </Button>
          ) : (
            <Button onClick={send} disabled={!hasApiKey || !input.trim()} style={{ fontSize: 11, padding: "3px 10px" }}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
