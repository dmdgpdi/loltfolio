# Frontend Agent Guidelines

## Tech Stack

- React, TypeScript, Vite, Tailwind CSS
- Vitest, Testing Library
- Oxlint, Oxfmt
- TanStack Query for server state when needed
- Zustand only when shared client state is necessary

## Architecture

Follow a lightweight Model–ViewModel–View architecture.

- **Model**: Owns business logic, rules, and data structures. Must be unit tested.
- **ViewModel**: Exposes typed interfaces to Views, transforms Model data, and manages presentation state and actions. Must be tested.
- **View (Component)**: Renders UI and handles user interactions through ViewModel. Keep business logic out of Views.

Dependency direction: `View → ViewModel → Model`

Architecture defines responsibilities, not folder structure. Do not enforce directories or domain boundaries.

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

1. `npm run fmt`
2. `npm run lint`
3. `npm run test -- --run`

- Fix issues introduced by the changes.
- Do not make unrelated changes to resolve pre-existing issues.
- Report any remaining failures.
- Do not consider a task complete without running these checks.
