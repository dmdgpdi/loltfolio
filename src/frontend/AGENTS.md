# Frontend Guidelines

## Tech Stack

React, Tailwind CSS via `@tailwindcss/turbopack`, TanStack Query and React Query Devtools.

## Architecture

Follow a lightweight Model–ViewModel–View architecture.

- **Model**: Owns business logic, rules, and data structures. Must be unit tested.
- **ViewModel**: Exposes typed interfaces to Views, transforms Model data, and manages presentation state and actions. Must be tested.
- **View (Component)**: Renders UI and handles user interactions through ViewModel. Keep business logic out of Views.

Dependency direction: `View → ViewModel → Model`

Frontend MVVM defines responsibilities, not a mandatory folder structure.

Use Vitest for Model and ViewModel unit tests. Keep frontend implementations here; `src/app` provides Next.js routing entry points. Do not import server-only backend code into client components.
