# Clerk UI Integration Plan — Diablo IDE

> Status: Draft — Pending Tailwind v4 spacing bug resolution

## Context

Diablo IDE is a Tauri v2 desktop application with a Vite-based frontend. We want to replicate Clerk's design system tokens inside the app. Clerk's design uses a mixed light/dark surface system with a single electric violet brand color, Geist typography, and precise spacing/shadow tokens.

## Current State

- **CSS entry:** `app/src/index.css` (Tailwind v4, `@import "tailwindcss"; @theme { ... }`)
- **Current palette:** Generic dark UI (`#0a0a0a`, `#121212`, `#3b82f6`)
- **Current font:** `'Segoe UI', system-ui, sans-serif`
- **Secondary CSS:** `dashboard/app/globals.css` (Tailwind v3 — out of scope for now)

## Tailwind v4 Spacing Bug

Tailwind v4's Vite plugin compiles utility classes at dev-server startup by scanning source files. Classes not present at startup are **NOT** added to the CSS bundle during HMR. This makes Tailwind spacing classes (`p-4`, `gap-2`, `mt-1`, etc.) unreliable in the Tauri WebView during development — they may silently have no effect.

**Rule:** Use inline `style` props for all spacing, sizing, and layout properties in TSX. Tailwind classes remain acceptable for non-spacing properties that were present from startup (colors, flex flags, borders, hover states, etc.).

## Integration Plan

### Phase 1: Font Infrastructure
Install self-hosted font packages so the Tauri WebView can load them without internet:

```bash
bun add @fontsource-variable/inter geist @fontsource/jetbrains-mono
```

Import fonts in the main app entry file (e.g., `app/src/main.tsx` or `app/src/App.tsx`):

```tsx
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import 'geist/font/sans.css';
```

### Phase 2: Token Setup in `app/src/index.css`
Replace the current `@theme` block with the full Clerk token set from `DESIGN.md`:

- **Colors:** All 14 Clerk colors (`void-black`, `fog-white`, `electric-violet`, etc.)
- **Typography:** Font families, text sizes, line heights, tracking, weights
- **Spacing:** All tokens (4px–172px) — available for reference but **not used as utility classes**
- **Border radius:** `6px` buttons, `16px` cards, `9999px` pills, `12px` code blocks
- **Shadows:** All 15 shadow tokens
- **Surfaces:** Page canvas, card surface, recessed, dark canvas, elevated dark

Also add a `:root` block with CSS custom properties for runtime access via `var(--token)`.

### Phase 3: Color Migration Map

| Current Token | Clerk Replacement | Notes |
|---------------|-------------------|-------|
| `--color-bg-app: #0a0a0a` | `--color-obsidian-card: #212126` | Dark IDE canvas |
| `--color-bg-sidebar: #121212` | `--color-dark-surface: #2f3037` | Elevated panels |
| `--color-border-subtle: #262626` | `--color-hairline: #d9d9de` | Borders (adapted for dark) |
| `--color-text-main: #e5e5e5` | `--color-pure-white: #ffffff` | Primary text |
| `--color-text-muted: #a3a3a3` | `--color-slate-mid: #696a78` | Secondary text |
| `--color-primary: #3b82f6` | `--color-electric-violet: #6c47ff` | Primary action |
| `--color-hover: #1f1f1f` | Derived from `--color-dark-surface` | Hover backgrounds |
| `--color-accent: #60a5fa` | `--color-cyan-spark: #5de3ff` | Accent (dark sections only) |

### Phase 4: Component Style Conventions

All spacing/sizing must use inline `style` with CSS custom properties:

```tsx
// ✅ Correct
<div style={{ padding: 'var(--spacing-16)', gap: 8, borderRadius: 'var(--radius-cards)' }}>

// ❌ Never do this — may silently fail in Tauri WebView
<div className="p-4 gap-2 rounded-2xl">
```

Non-spacing Tailwind classes that are safe:
- Colors: `text-text-main`, `bg-bg-sidebar`, `text-accent`
- Borders: `border-b`, `border-border-subtle`
- Flex/layout flags: `flex`, `items-center`, `flex-1`, `shrink-0`, `overflow-hidden`
- Visibility/interaction: `cursor-pointer`, `select-none`, `whitespace-nowrap`, `transition-colors`
- Hover variants: `hover:bg-hover`, `hover:text-text-main`

### Phase 5: Typography

- **Primary UI font:** Geist (weight 400–700)
- **Mono/code font:** JetBrains Mono (weight 400–600, +0.10em tracking at small sizes)
- **Type scale:** Caption 10px, heading-sm 18px, heading 20px, heading-lg 32px, display 64px
- **Tracking:** -0.035em at display sizes, -0.015em at mid sizes

### Phase 6: Surface System

Clerk uses a mixed light/dark system. Diablo IDE will default to dark (IDE = dark), but support light cards/modals for component previews:

- **Dark canvas:** `#212126` (main app background)
- **Elevated dark:** `#2f3037` (sidebar, panels)
- **Light card surface:** `#ffffff` (modals, forms, previews)
- **Recessed surface:** `#f7f7f8` (input backgrounds inside light cards)

### Phase 7: Gradients & Effects

- **Hero halo:** `radial-gradient(...)` with violet → yellow → cyan (max opacity 0.24)
- **Brand sweep:** `linear-gradient(to right, #6c47ff 25%, #5de3ff 75%)` for decorative text/lines
- **Dark card radial:** `radial-gradient(...)` for depth inside dark cards
- **Dark card borders:** Inset box-shadow `rgba(255,255,255,0.024)` — no CSS `border` property

## Open Questions

1. **Tailwind v4 spacing bug:** Need to confirm the best approach — inline styles only, or investigate if a Vite plugin config fix exists.
2. **Dashboard CSS:** Keep `dashboard/app/globals.css` on Tailwind v3, or migrate later?
3. **Light/dark toggle:** Full theme toggle, or fixed dark with light cards for previews?

## Files to Touch

- `app/src/index.css` — Full token rewrite
- `app/src/main.tsx` (or `App.tsx`) — Font imports
- `app/src/App.tsx` — Verify root styles still apply
- Individual components — Migrate spacing from Tailwind utilities to inline styles

## Verification Checklist

- [ ] App compiles without errors
- [ ] Fonts load correctly in Tauri WebView (offline)
- [ ] Colors match Clerk tokens
- [ ] Spacing works reliably in dev and production
- [ ] No visual regressions in existing components
