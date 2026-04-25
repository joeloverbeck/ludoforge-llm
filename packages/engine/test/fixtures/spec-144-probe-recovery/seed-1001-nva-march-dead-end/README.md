# Seed 1001 NVA March Dead-End Fixture

Spec 144 regression fixture for the Fire in the Lake ARVN-evolved campaign witness.
The decision sequence records the deterministic prefix up to the historical NVA march probe hole on seed 1001.
The post-fix engine reaches `stopReason=terminal`; the recovery safety net records the residual probe hole instead of terminating as `noLegalMoves`.

Regenerate after intentional GameDef changes with:

```bash
pnpm -F @ludoforge/engine build
node packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs
```
