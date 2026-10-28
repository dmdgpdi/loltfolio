# Agent Guidelines

## Tech Stack

- **Common**: TypeScript, pnpm; Biome for linting and formatting.
- **Framework**: Next.js (App Router) for frontend and server-side code.
- **Testing**: Vitest.
- **Tooling**: `tsx` for TypeScript scripts, `dotenv` for loading environment variables in standalone scripts, React Compiler via `babel-plugin-react-compiler`.

## Code Organization

- `src/app`: Thin Next.js page, layout, and Route Handler entry points.
- `src/frontend`: Frontend implementations; follow [Frontend Guidelines](src/frontend/AGENTS.md).
- `src/backend`: Domain modules and database infrastructure; follow [Backend Guidelines](src/backend/AGENTS.md).
- Entry points in `src/app` follow the relevant frontend or backend architecture linked above.

## Development Rules

- Implement only what is explicitly requested.
- Do not add features, abstractions, dependencies, or refactor unrelated code without being asked.
- Prefer simple solutions over speculative extensibility.
- Follow existing code conventions and structure.
- Keep changes minimal and focused.
- Update relevant tests when behavior changes.

## Documentation

- Keep AGENTS.md concise and focused on essential rules.
- Create or update documents in `docs/` only when additional explanation or maintained knowledge is necessary.
- Keep documentation accurate and up to date when relevant changes occur.
- Use AGENTS.md as the navigation entry point for documentation.
- Add relative Markdown links to relevant `docs/` files under the Documentation Index below.
- Update or remove navigation links when documents change or are deleted.
- Do not duplicate detailed documentation in AGENTS.md.

### Documentation Index

Add links here as documents are created.

## Completion Checklist

After every task, run:

1. `pnpm run fmt`
2. `pnpm run lint`
3. `pnpm run test -- --run`

- Fix issues introduced by the changes.
- Do not make unrelated changes to resolve pre-existing issues.
- Report any remaining failures.
- Do not consider a task complete without running these checks.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
