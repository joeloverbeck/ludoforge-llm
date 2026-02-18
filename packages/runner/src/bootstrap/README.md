# Runner Bootstrap Registry

`resolveBootstrapConfig` is registry-driven. Do not add game-specific branches in the resolver.
Bootstrap targets are defined once in `bootstrap-targets.json` and consumed by both runtime registry and fixture tooling.

## Adding a New Bootstrap Target

1. Add a new entry in `bootstrap-targets.json` with:
   - `id`
   - `queryValue` (used by `?game=<queryValue>`)
   - `defaultSeed`
   - `defaultPlayerId`
   - `sourceLabel`
   - `fixtureFile`
   - optional `generatedFromSpecPath` for generated fixtures
2. Ensure the fixture JSON exists under `src/bootstrap/` (or run generation for entries with `generatedFromSpecPath`).
3. Add/update tests in:
   - `packages/runner/test/bootstrap/bootstrap-registry.test.ts`
   - `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`
4. Run:
   - `pnpm -F @ludoforge/runner bootstrap:fixtures`
   - `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
   - `pnpm -F @ludoforge/runner test`
   - `pnpm -F @ludoforge/runner typecheck`
