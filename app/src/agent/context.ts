import { useEditorStore } from "../store/editor";

export async function buildContext(mode: "ask" | "edit" | "agent"): Promise<string> {
  const { activeFile, openFiles, diagnostics } = useEditorStore.getState();
  const parts: string[] = [];

  if (activeFile) {
    const file = openFiles.find((f) => f.path === activeFile);
    if (file) {
      parts.push(`<file path="${activeFile}">\n${file.content}\n</file>`);
    }

    const fileDiags =
      (diagnostics[activeFile] ?? diagnostics[`file://${activeFile}`] ?? []) as Array<{
        message: string;
        range?: { start?: { line?: number } };
        severity?: number;
      }>;

    if (fileDiags.length > 0) {
      const formatted = fileDiags
        .map((d) => `  Line ${(d.range?.start?.line ?? 0) + 1}: ${d.message}`)
        .join("\n");
      parts.push(`<diagnostics path="${activeFile}">\n${formatted}\n</diagnostics>`);
    }
  }

  if (mode === "edit" && activeFile) {
    parts.push(
      `<instruction>Edit mode: only modify the file shown above. Use SEARCH/REPLACE blocks.</instruction>`,
    );
  }

  return parts.filter(Boolean).join("\n\n");
}
