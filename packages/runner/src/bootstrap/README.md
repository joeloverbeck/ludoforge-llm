# Runner Bootstrap Registry

`runner-bootstrap.ts` is the canonical typed bootstrap service for runner consumers. Browser search params are parsed once at app startup into a typed request by `browser-entry.ts`; `resolve-bootstrap-config.ts` remains only as a compatibility helper for search-param based bootstrap tests and true URL-entry adapters.
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
   - This updates both `*-game-def.json` and `*-game-metadata.json` bootstrap artifacts.
3. Ensure drift check is clean:
   - `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
4. Add/update tests in:
   - `packages/runner/test/bootstrap/bootstrap-registry.test.ts`
   - `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`
   - `packages/runner/test/bootstrap/runner-bootstrap.test.ts` (if the typed service changes)
5. Run:
   - `pnpm -F @ludoforge/runner test`
   - `pnpm -F @ludoforge/runner typecheck`
