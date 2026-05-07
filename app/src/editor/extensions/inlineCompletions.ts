import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { StateEffect, StateField, Extension } from "@codemirror/state";
import { GATEWAY_URL } from "../../config";

const setGhostText = StateEffect.define<{ text: string; from: number } | null>();

class GhostTextWidget extends WidgetType {
  readonly text: string;
  constructor(text: string) { super(); this.text = text; }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.cssText = "opacity:0.4;pointer-events:none;font-style:italic;";
    span.className = "cm-ghost-text";
    return span;
  }
  ignoreEvent() { return true; }
}

const ghostTextField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhostText)) {
        if (!e.value) return Decoration.none;
        const { text, from } = e.value;
        return Decoration.set([
          Decoration.widget({ widget: new GhostTextWidget(text), side: 1 }).range(from),
        ]);
      }
    }
    // Clear on any document change or selection move
    if (tr.docChanged || tr.selection) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function currentGhostText(view: EditorView): string | null {
  const deco = view.state.field(ghostTextField);
  let text: string | null = null;
  deco.between(0, view.state.doc.length, (_from, _to, d) => {
    if (d.spec.widget instanceof GhostTextWidget) {
      text = (d.spec.widget as GhostTextWidget).text;
    }
  });
  return text;
}

const acceptGhostKeymap = keymap.of([{
  key: "Tab",
  run(view) {
    const ghost = currentGhostText(view);
    if (!ghost) return false;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: ghost },
      effects: setGhostText.of(null),
      selection: { anchor: pos + ghost.length },
    });
    return true;
  },
}]);

const DEBOUNCE_MS = 300;

function inlineCompletionsPlugin(getLang: () => string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  return ViewPlugin.fromClass(class {
    update(update: ViewUpdate) {
      if (!update.docChanged) return;

      if (timer) clearTimeout(timer);
      controller?.abort();

      // Clear existing ghost text on every keystroke
      update.view.dispatch({ effects: setGhostText.of(null) });

      timer = setTimeout(async () => {
        const view = update.view;
        controller = new AbortController();
        const signal = controller.signal;

        const state = view.state;
        const pos = state.selection.main.head;
        const text = state.doc.toString();
        const prefix = text.slice(0, pos);
        const suffix = text.slice(pos);
        const language = getLang();

        if (!prefix.trim()) return;

        try {
          const res = await fetch(`${GATEWAY_URL}/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, suffix, language }),
            signal,
          });
          if (!res.ok || signal.aborted) return;
          const data = await res.json() as { completion?: string };
          const completion = data.completion ?? "";
          if (!completion || signal.aborted) return;

          view.dispatch({ effects: setGhostText.of({ text: completion, from: view.state.selection.main.head }) });
        } catch {
          // fetch aborted or failed — silently ignore
        }
      }, DEBOUNCE_MS);
    }

    destroy() {
      if (timer) clearTimeout(timer);
      controller?.abort();
    }
  });
}

export function inlineCompletionsExtension(getLang: () => string): Extension {
  return [ghostTextField, acceptGhostKeymap, inlineCompletionsPlugin(getLang)];
}
