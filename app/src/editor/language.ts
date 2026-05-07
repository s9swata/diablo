import { LanguageSupport } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage } from "@codemirror/language";
import { go } from "@codemirror/legacy-modes/mode/go";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";

export interface LangInfo {
  support: LanguageSupport | null;
  lspId: string;
  displayName: string;
}

const EXT_MAP: Record<string, LangInfo> = {
  ts:   { support: javascript({ typescript: true }), lspId: "typescript",  displayName: "TypeScript" },
  tsx:  { support: javascript({ typescript: true, jsx: true }), lspId: "typescript", displayName: "TSX" },
  js:   { support: javascript(), lspId: "javascript", displayName: "JavaScript" },
  jsx:  { support: javascript({ jsx: true }), lspId: "javascript", displayName: "JSX" },
  rs:   { support: rust(), lspId: "rust", displayName: "Rust" },
  py:   { support: python(), lspId: "python", displayName: "Python" },
  go:   { support: new LanguageSupport(StreamLanguage.define(go)), lspId: "go", displayName: "Go" },
  cpp:  { support: cpp(), lspId: "cpp", displayName: "C++" },
  cc:   { support: cpp(), lspId: "cpp", displayName: "C++" },
  cxx:  { support: cpp(), lspId: "cpp", displayName: "C++" },
  c:    { support: cpp(), lspId: "c", displayName: "C" },
  h:    { support: cpp(), lspId: "cpp", displayName: "C/C++ Header" },
  html: { support: html(), lspId: "html", displayName: "HTML" },
  css:  { support: css(), lspId: "css", displayName: "CSS" },
  scss: { support: css(), lspId: "css", displayName: "SCSS" },
  json: { support: json(), lspId: "json", displayName: "JSON" },
  md:   { support: markdown(), lspId: "markdown", displayName: "Markdown" },
  toml: { support: new LanguageSupport(StreamLanguage.define(toml)), lspId: "toml", displayName: "TOML" },
  sh:   { support: new LanguageSupport(StreamLanguage.define(shell)), lspId: "shell", displayName: "Shell" },
  bash: { support: new LanguageSupport(StreamLanguage.define(shell)), lspId: "shell", displayName: "Bash" },
};

export function langFromPath(path: string): LangInfo {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? { support: null, lspId: "plaintext", displayName: "Plain Text" };
}
