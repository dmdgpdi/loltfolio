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

## Development Workflow

- Define the behavior specification before implementation: inputs, outputs, invariants, missing or unknown values, errors, and boundary conditions.
- Define the required interfaces and types from that specification, then write behavior tests against those contracts before implementing them.
- Run the tests and confirm they fail for the expected unimplemented behavior, rather than unrelated setup errors.
- Implement only what is needed to satisfy the specification and tests, then run the completion checks in the root AGENTS.md.
- Keep interfaces and tests grounded in the specification. Do not weaken assertions or change expected behavior merely to make an implementation pass; revise the specification first when requirements change.

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

## Type Consistency

- Reuse established domain types across entities, interfaces, services, implementations, database mappings, and test doubles. Do not widen a domain type to `number` or `string` for the same value (for example, use `QueueId` for queue identifiers).
- Validate external input at boundaries before converting it to domain types; type annotations or assertions do not replace runtime validation.
- When changing a shared type, check all callers, implementations, mappings, and tests for consistency. Add type contract checks when needed and run the TypeScript type checker.