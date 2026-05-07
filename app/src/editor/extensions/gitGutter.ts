import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface LineAnnotation {
  line: number;
  type: "added" | "modified" | "deleted";
}

export const setGitAnnotations = StateEffect.define<LineAnnotation[]>();

const gitGutterField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setGitAnnotations)) {
        const annotations = e.value;
        const decorations = annotations
          .filter((a) => a.line >= 1 && a.line <= tr.state.doc.lines)
          .map((a) => {
            const line = tr.state.doc.line(a.line);
            return Decoration.line({ class: `git-gutter-${a.type}` }).range(line.from);
          })
          .sort((a, b) => a.from - b.from);
        return Decoration.set(decorations, true);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const gitGutterTheme = EditorView.baseTheme({
  ".git-gutter-added":    { boxShadow: "inset 3px 0 0 #3fb950" },
  ".git-gutter-modified": { boxShadow: "inset 3px 0 0 #e3b341" },
  ".git-gutter-deleted":  { boxShadow: "inset 3px 0 0 #f85149" },
});

export function gitGutterExtension() {
  return [gitGutterField, gitGutterTheme];
}
