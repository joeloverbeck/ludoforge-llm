# Runner Bootstrap Registry

`resolveBootstrapConfig` is registry-driven. Do not add game-specific branches in the resolver.

## Adding a New Bootstrap Target

1. Add a new descriptor in `bootstrap-registry.ts` with:
   - `id`
   - `queryValue` (used by `?game=<queryValue>`)
   - `defaultSeed`
   - `defaultPlayerId`
   - `sourceLabel`
   - `resolveGameDefInput`
2. Add/update tests in:
   - `packages/runner/test/bootstrap/bootstrap-registry.test.ts`
   - `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`
3. Run:
   - `pnpm -F @ludoforge/runner test`
   - `pnpm -F @ludoforge/runner typecheck`

