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
   - `generatedFromSpecPath` (required; canonical `GameSpecDoc` directory)
2. Generate fixtures from canonical specs:
   - `pnpm -F @ludoforge/runner bootstrap:fixtures`
3. Ensure drift check is clean:
   - `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
4. Add/update tests in:
   - `packages/runner/test/bootstrap/bootstrap-registry.test.ts`
   - `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`
5. Run:
   - `pnpm -F @ludoforge/runner test`
   - `pnpm -F @ludoforge/runner typecheck`
