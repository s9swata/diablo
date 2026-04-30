import type * as Monaco from "monaco-editor";
import { GATEWAY_URL } from "../../config";

const DEBOUNCE_MS = 300;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function registerInlineCompletionProvider(monaco: typeof Monaco) {
  monaco.languages.registerInlineCompletionsProvider("*", {
    async provideInlineCompletions(model, position, context, token) {
      // Debounce automatic triggers; skip delay for explicit (Ctrl+Space)
      if (
        context.triggerKind ===
        monaco.languages.InlineCompletionTriggerKind.Automatic
      ) {
        await sleep(DEBOUNCE_MS);
        if (token.isCancellationRequested) return { items: [] };
      }

      const fullText = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = fullText.slice(0, offset);
      const suffix = fullText.slice(offset);

      if (!prefix.trim()) return { items: [] };

      let completion: string;
      try {
        const res = await fetch(`${GATEWAY_URL}/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix,
            suffix,
            language: model.getLanguageId(),
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) return { items: [] };
        const data = await res.json() as { completion?: string };
        completion = data.completion ?? "";
      } catch {
        return { items: [] };
      }

      if (!completion || token.isCancellationRequested) return { items: [] };

      return {
        items: [
          {
            insertText: completion,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          },
        ],
        enableForwardStability: true,
      };
    },

    freeInlineCompletions() {},
    // Monaco runtime calls disposeInlineCompletions in newer builds despite missing from types
    ...({ disposeInlineCompletions() {} } as object),
  } as Monaco.languages.InlineCompletionsProvider);
}
