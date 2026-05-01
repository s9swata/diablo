import React from "react";

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white border-none hover:opacity-90",
  ghost:   "bg-bg-sidebar text-text-main border border-border-subtle hover:bg-hover",
  danger:  "bg-red-900/80 text-white border-none hover:bg-red-800",
};

export function Button({ children, variant = "primary", style: s, className = "", ...rest }: ButtonProps) {
  return (
    <button
      style={{ borderRadius: 2, padding: "4px 10px", fontSize: 12, cursor: "pointer", ...s }}
      className={`transition-colors ${variantClass[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function Modal({ children, onClose }: ModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ─── Select ──────────────────────────────────────────────────────────────────

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ children, style: s, className = "", ...rest }: SelectProps) {
  return (
    <select
      style={{ padding: "2px 6px", ...s }}
      className={`bg-bg-sidebar text-text-muted border border-border-subtle rounded-sm text-[11px] cursor-pointer outline-none focus:border-text-muted ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
