export function Breadcrumb({ path, root }: { path: string | null; root: string | null }) {
  if (!path) return null;
  const relative = root && path.startsWith(root) ? path.slice(root.length + 1) : path;
  const parts = relative.split("/");

  return (
    <div className="bg-bg-sidebar border-b border-border-subtle flex items-center text-[11px] text-text-muted shrink-0 overflow-hidden whitespace-nowrap select-none" style={{ height: 28, padding: "0 16px" }}>
      {parts.map((part, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span style={{ padding: "0 4px", margin: "0 4px" }} className="opacity-70 text-[13px]">›</span>}
          <span className={i === parts.length - 1 ? "text-text-main" : "text-text-muted"}>
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}
