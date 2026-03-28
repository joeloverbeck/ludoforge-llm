# Bootstrap Test Ownership

Bootstrap tests are split by the production module seam:

- `resolve-bootstrap-config.test.ts` covers the thin browser/query contract only.
- `runner-bootstrap.test.ts` covers real fixture-backed bootstrap resolution, visual-config validation, and capability derivation.

Rules:

- Prefer mocks in `resolve-bootstrap-config` tests. That module should not need FITL or Texas fixtures to prove query parsing and handle wiring.
- Keep real production-fixture proofs in `runner-bootstrap` tests, because that module owns fixture loading and validation.
- Add explicit timeout overrides only when a fixture-backed integration path proves it needs more than Vitest's default budget.

Targeted bootstrap run:

`pnpm -F @ludoforge/runner test test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/runner-bootstrap.test.ts`
