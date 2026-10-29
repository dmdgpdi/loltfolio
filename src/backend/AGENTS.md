# Backend Guidelines

## Tech Stack

PostgreSQL (local Docker / Neon) via `pg`, Drizzle ORM, Drizzle Kit. Use the Node.js runtime for database access.

## Architecture

Organize backend code into domain modules. Keep each domain's Controller, Service, entities, aggregates, Repository interface, and Repository implementation together.

- **Route Handler (`app/**/route.ts`)**: Thin Next.js entry point that delegates HTTP methods to the domain Controller.
- **Controller**: Parses and validates input, passes authentication context to the Service, and maps results and errors to HTTP responses.
- **Service**: Orchestrates use cases and transaction boundaries using domain objects and Repository interfaces. Keep HTTP types out of its interface.
- **Entity / Aggregate**: Owns business rules, invariants, and state changes. Must not depend on Next.js or Drizzle.
- **Repository interface**: Defines domain persistence contracts without Drizzle-specific types.
- **Repository implementation**: Implements those contracts using Drizzle. Keep database table definitions distinct from domain entities.

Dependency direction: `Route Handler → Controller → Service → domain objects / Repository interfaces`. Drizzle implementations depend on Repository interfaces; Services must not depend directly on those implementations.

Unit test domain rules and Service behavior; use Repository test doubles for Service tests. Add roles only when a feature needs them, rather than creating every layer in advance.

## Testing

- Prefer classicist tests: use real domain objects and verify observable behavior.
- Structure tests with Arrange–Act–Assert; use test doubles at external boundaries when needed.

## Error Handling

- Use railway-oriented error handling with `@praha/byethrow` for expected failures.
- Define custom errors with `@praha/error-factory` in the owning layer's `errors/` directory.

## Database

- DB client and table schema entry point: `db/client.ts`, `db/schema.ts`.
- Drizzle configuration: `drizzle.config.ts`; generated SQL and snapshots: `db/migrations/`.
- Run package scripts from the repository root. The config resolves schema, output, and env paths from its location back to the repository root.
- Generate and review migrations during development; commit SQL and snapshots. Apply reviewed migrations with `migrate`; do not use `push` in production or edit applied migrations.
