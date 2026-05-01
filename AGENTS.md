Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# Before executing ANY task, agents MUST consult the project's knowledge graph to understand existing architecture, relationships, and patterns.

### When to Use the Graph
- Before modifying any component or function
- When asked about architecture or dependencies
- When adding new features that may touch existing code
- When debugging or tracing execution paths

### Graph Files Location
- **Audit report**: `graphify-out/GRAPH_REPORT.md`

python3 -c "from graphify.ingest import query; query('What does X do?')"
```

## 🚨 Critical Safety Rules

### 1. Git Safety
- NEVER run destructive commands:
  - `git reset --hard`
  - `git clean -fd`
  - Any command that rewrites or deletes history

- ALWAYS create commits:
  - Commit BEFORE making changes
  - Commit AFTER completing a task

- Commit messages must be meaningful and describe the changes made.

---

### 2. File System Safety
- NEVER execute destructive commands such as:
  - `rm -rf *`
  - Recursive deletion of project files

- Do NOT delete files unless explicitly instructed and necessary.

---

## 📚 Documentation & Accuracy

- ALWAYS follow the **latest official documentation** of any framework, library, or tool used.
- Do NOT rely on outdated knowledge or assumptions.
- If unsure, prioritize correctness over speed.

---

## ⚙️ Development Behavior

- Make incremental, safe changes (avoid large unreviewable diffs)
- Preserve existing functionality unless explicitly modifying it
- Write clean, readable, and maintainable code

### Runtime & Package Manager

- **Always use `bun`** as the runtime and package manager.
- NEVER use `npm`, `npx`, `yarn`, or `pnpm`.
- Install packages: `bun add <pkg>`
- Run scripts: `bun run <script>` or `bunx <pkg>`
- Execute files: `bun <file>`

---

### CSS & Spacing Rules (Diablo IDE — Tauri + Vite + Tailwind v4)

**NEVER use Tailwind utility classes for `padding`, `margin`, `gap`, `width`, or `height`.**

#### Why

Tailwind v4's Vite plugin compiles utility classes at **dev-server startup** by scanning source files. Classes that weren't present at startup are NOT added to the CSS bundle during HMR — they silently have no effect. This makes Tailwind spacing classes unreliable in the Tauri WebView during development.

#### Rule

For all spacing, sizing, and layout properties use **inline `style` props** in TSX:

```tsx
// ✅ Correct — always works
<div style={{ padding: "0 12px", gap: 8, marginTop: 4 }}>

// ❌ Never do this for spacing — may silently have no effect
<div className="px-3 gap-2 mt-1">
```

#### What Tailwind IS still fine for

Tailwind classes are acceptable for properties that don't involve spacing and were present in the codebase from the start:
- Colors: `text-text-main`, `bg-bg-sidebar`, `text-accent`
- Borders: `border-b`, `border-border-subtle`
- Flex/layout flags: `flex`, `items-center`, `flex-1`, `shrink-0`, `overflow-hidden`
- Visibility/interaction: `cursor-pointer`, `select-none`, `whitespace-nowrap`, `transition-colors`
- Hover variants: `hover:bg-hover`, `hover:text-text-main`

These were in the initial bundle and are safe to use.

---


## ✅ Task Execution Workflow

For EVERY task:

1. Commit current state  
2. Execute requested changes  
3. Verify functionality (basic sanity checks)  
4. Commit final state  

---



## 🧠 Guiding Principles

- Safety > Speed  
- Consistency > Creativity  
- Accuracy > Assumptions  

---

Agents that fail to follow these rules are considered unsafe.

