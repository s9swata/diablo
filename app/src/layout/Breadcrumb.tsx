export function Breadcrumb({ path, root }: { path: string | null; root: string | null }) {
  if (!path) return null;
  const relative = root && path.startsWith(root) ? path.slice(root.length + 1) : path;
  const parts = relative.split("/");

  return (
    <div className="h-7 bg-bg-sidebar border-b border-border-subtle flex items-center px-4 text-[11px] text-text-muted shrink-0 overflow-hidden whitespace-nowrap select-none">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="mx-1 opacity-50">›</span>}
          <span className={i === parts.length - 1 ? "text-text-main" : "text-text-muted"}>
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}
