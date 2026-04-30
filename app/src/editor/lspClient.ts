import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type * as Monaco from "monaco-editor";
import { useEditorStore } from "../store/editor";

interface LspMsg {
  server_id: string;
  msg: string;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface ServerSpec {
  command: string;
  args: string[];
}

const SUPPORTED_LANGUAGES = new Set(["rust", "typescript", "javascript", "python", "cpp", "c"]);

const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { didOpen: true, didChange: true, didClose: true },
    hover: { contentFormat: ["markdown", "plaintext"] },
    completion: {
      completionItem: {
        snippetSupport: false,
        documentationFormat: ["markdown", "plaintext"],
      },
    },
    definition: { linkSupport: false },
    publishDiagnostics: { relatedInformation: false },
  },
};

// Hard fallback — only fires if server is completely unresponsive
const HARD_TIMEOUT_MS = 60_000;

class LspClient {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();
  private activeServers = new Set<string>();
  private failedServers = new Set<string>();
  private starting = new Map<string, Promise<string | null>>();
  private modelVersions = new Map<string, number>();
  private openedUris = new Map<string, Set<string>>();
  private unlisten: UnlistenFn | null = null;

  constructor() {
    // Single listener — store unlisten so HMR doesn't stack duplicates
    listen<LspMsg>("lsp_msg", (event) => {
      try {
        const msg = JSON.parse(event.payload.msg) as Record<string, unknown>;
        console.debug("[lsp ←]", event.payload.server_id, msg.method ?? `id=${msg.id}`, msg);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id as number);
          if (p) {
            this.pending.delete(msg.id as number);
            const err = msg.error as { message: string } | undefined;
            if (err) p.reject(new Error(err.message));
            else p.resolve(msg.result ?? null);
          } else {
            console.warn("[lsp] no pending request for id", msg.id);
          }
        } else if (msg.method) {
          const h = this.notificationHandlers.get(msg.method as string);
          if (h) h(msg.params);
          else console.debug("[lsp] unhandled notification", msg.method);
        }
      } catch (e) {
        console.error("[lsp] failed to parse message", event.payload.msg, e);
      }
    }).then((fn) => { this.unlisten = fn; });
  }

  dispose() {
    this.unlisten?.();
  }

  getNextVersion(uri: string): number {
    const v = (this.modelVersions.get(uri) ?? 0) + 1;
    this.modelVersions.set(uri, v);
    return v;
  }

  async ensureStarted(language: string): Promise<string | null> {
    const { workspaceRoot } = useEditorStore.getState();
    if (!workspaceRoot) return null;
    if (!SUPPORTED_LANGUAGES.has(language)) return null;
    const serverId = `${workspaceRoot}:${language}`;

    if (this.activeServers.has(serverId)) return serverId;
    if (this.failedServers.has(serverId)) return null;
    if (this.starting.has(serverId)) return this.starting.get(serverId)!;

    const p = this._doStart(serverId, language, workspaceRoot);
    this.starting.set(serverId, p);
    const result = await p;
    this.starting.delete(serverId);
    return result;
  }

  private async _doStart(
    serverId: string,
    language: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    try {
      const spec = await invoke<ServerSpec>("lsp_ensure", { language });
      await invoke("lsp_start", {
        serverId,
        command: spec.command,
        args: spec.args,
        workspaceRoot,
      });
      await this.request(serverId, "initialize", {
        processId: null,
        rootUri: `file://${workspaceRoot}`,
        capabilities: CLIENT_CAPABILITIES,
        workspaceFolders: [
          { uri: `file://${workspaceRoot}`, name: workspaceRoot.split("/").pop() ?? workspaceRoot },
        ],
      });
      await this.notify(serverId, "initialized", {});
      this.activeServers.add(serverId);
      return serverId;
    } catch (e) {
      console.error("[lsp] failed to start server for", language, e);
      this.failedServers.add(serverId);
      return null;
    }
  }

  async ensureFileOpen(
    serverId: string,
    uri: string,
    languageId: string,
    text: string,
  ): Promise<void> {
    let uris = this.openedUris.get(serverId);
    if (!uris) { uris = new Set(); this.openedUris.set(serverId, uris); }
    if (uris.has(uri)) return;
    uris.add(uri);
    console.debug("[lsp] didOpen", serverId, uri);
    await this.notify(serverId, "textDocument/didOpen", {
      textDocument: { uri, languageId, version: this.getNextVersion(uri), text },
    });
  }

  // Use Monaco's CancellationToken so requests cancel when user moves cursor.
  // Hard timeout is a last-resort fallback for unresponsive servers.
  async request(
    serverId: string,
    method: string,
    params: unknown,
    token?: Monaco.CancellationToken,
  ): Promise<unknown> {
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    console.debug("[lsp →]", serverId, method, `id=${id}`);
    await invoke("lsp_send", { serverId, message: msg });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      // Cancel via Monaco token (cursor moved, new keystroke, etc.)
      const cancelDisposable = token?.onCancellationRequested(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          this.notify(serverId, "$/cancelRequest", { id }).catch(() => {});
          reject(new Error("cancelled"));
        }
      });

      // Hard fallback — only if server never responds at all
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          cancelDisposable?.dispose();
          console.warn("[lsp] hard timeout", method, `id=${id}`);
          reject(new Error("LSP request timeout"));
        }
      }, HARD_TIMEOUT_MS);

      // Clean up timer when resolved/rejected normally
      const origResolve = resolve;
      const origReject = reject;
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); cancelDisposable?.dispose(); origResolve(v); },
        reject: (e) => { clearTimeout(timer); cancelDisposable?.dispose(); origReject(e); },
      });
    });
  }

  async notify(serverId: string, method: string, params: unknown): Promise<void> {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    console.debug("[lsp →]", serverId, method, "(notify)");
    await invoke("lsp_send", { serverId, message: msg });
  }

  onNotification(method: string, handler: (params: unknown) => void) {
    this.notificationHandlers.set(method, handler);
  }

  async stop(serverId: string) {
    await invoke("lsp_stop", { serverId });
    this.activeServers.delete(serverId);
  }
}

// HMR-safe singleton: dispose old instance on hot reload
const _global = globalThis as typeof globalThis & { __lspClient?: LspClient };
if (_global.__lspClient) {
  _global.__lspClient.dispose();
}
_global.__lspClient = new LspClient();
export const lspClient = _global.__lspClient;

export function monacoLangToLsp(monacoLang: string): string {
  const map: Record<string, string> = {
    typescriptreact: "typescript",
    javascript: "javascript",
    typescript: "typescript",
    rust: "rust",
    python: "python",
    cpp: "cpp",
    c: "cpp",
    "c++": "cpp",
    go: "go",
  };
  return map[monacoLang] ?? monacoLang;
}
