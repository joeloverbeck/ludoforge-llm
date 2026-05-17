# 180STDVECOBSROL-002: Phase 1 - Bounded standing-projection route

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - policy preview/evaluation standing projection.
**Deps**: `archive/tickets/180STDVECOBSROL-001.md`

## Problem

Spec 180 needs a generic way for action-selection preview to observe ordinary-operation effects on every seat's terminal standing. Spec 179's `outcomeGrantContinuation` only helps paths that actually publish `outcomeGrantResolve`; the production ordinary-operation witness does not. This ticket implements the bounded standing-projection route required to turn the Phase 0 RED witness green.

## Assumption Reassessment (2026-05-17)

1. The selected architecture preserves existing `preview.victory.*` scalar refs for ready cells and introduces status-bearing standing cells behind them.
2. The route must use the existing one-rules protocol, not raw effect inspection or FITL-specific action handling.
3. `archive/tickets/180STDVECOBSROL-001.md` owns the focused RED witness this ticket must satisfy.
4. Boundary reset approved in-session on 2026-05-17: the base Foundation 20 fix that prevents an all-unavailable preview-derived `seatAgg(sum)` from contributing numeric `0` is owned here because it is required for the Phase 1 witness to turn green. `tickets/180STDVECOBSROL-003.md` remains the owner of authored `seatAgg.availability` modes, compiler/validator/schema wiring, and migration diagnostics.

## Architecture Check

1. Projection is bounded by a named cap and recorded in trace metadata per Foundation 10.
2. Standing values are computed from existing terminal margin/ranking machinery, preserving engine agnosticism.
3. Unavailable, capped, hidden, stochastic, unresolved, failed, and gated standing cells remain distinct Foundation 20 statuses.

## What to Change

### 1. Implement standing projection

Add the smallest generic projection route needed for action-selection candidates to produce current/projected standing cells through the normal published-decision/apply path.

### 2. Preserve scalar compatibility for ready cells

Existing `preview.victory.currentMargin.<seat>` and `preview.victory.currentRank.<seat>` must continue to return the same numeric values when the projected standing cell is ready.

### 3. Emit status for unavailable cells

When the projection cannot observe a cell within the cap, the evaluator must record an unavailable preview status and require explicit fallback before the value contributes.

### 4. Prevent the base silent-zero fallback for the standing witness

When every preview-derived per-seat value in the standing projection is unavailable, the aggregate must remain unavailable so `previewFallback` can handle it. Do not implement the full `seatAgg.availability` authored API in this ticket.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify if trace metadata is needed for the route)
- `packages/engine/src/kernel/types-core.ts` and schema sources (modify only if the trace/config surface requires it)
- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` (modify from RED to GREEN)
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` (modify from bug pin to regression for the base no-silent-zero behavior)

## Out of Scope

- `seatAgg.availability` modes beyond what the projection needs to avoid silent numeric contribution.
- `previewUsage.seatMatrix` full materialization.
- Named role primitives.
- FITL ARVN campaign witness.

## Acceptance Criteria

### Tests That Must Pass

1. Phase 0 ordinary-operation standing witness is green.
2. Ready-cell scalar refs preserve existing `preview.victory.*` behavior.
3. Unavailable/capped projected standing does not contribute as numeric `0` without explicit fallback.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific engine branches.
2. No raw-effect shortcut outside the one-rules protocol.
3. Projection cap metadata is deterministic and trace-visible.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` - turns GREEN.
2. Focused preview-integrity regression for unavailable standing fallback.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled `node --test` witness command.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-17)

Completed on 2026-05-17.

Boundary reset:

- User approved Option 2 on 2026-05-17 after Foundations reassessment. The base Foundation 20 repair for all-unavailable preview-derived `seatAgg(sum)` moved into this ticket because the Phase 1 witness cannot turn green while unavailable standing cells still contribute numeric `0`.
- `tickets/180STDVECOBSROL-003.md` remains the owner of authored `seatAgg.availability` modes, compiler/validator/schema wiring, migration diagnostics, and partial-availability semantics.

What landed:

- `packages/engine/src/agents/policy-preview.ts` now reports preview visibility denial as `hidden` status-bearing evidence instead of opaque `unavailable`.
- `packages/engine/src/agents/policy-evaluation-core.ts` now keeps an all-unavailable preview-derived `seatAgg(sum)` unavailable instead of falling through to numeric `0`. Ready numeric cells still aggregate as before.
- `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts` gives the standing-preview consideration an explicit `previewFallback: noContribution`.
- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` turns green without changing its assertion target.
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` is rewritten from the Phase 0 bug pin into the Phase 1 regression: all-unavailable standing aggregates fire fallback and record unknown preview refs without score contribution.
- `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts` was updated as same-package verification fallout after the ticket-named engine test lane exposed stale Spec 179 expectations. It now preserves the default opt-out assertion while recognizing the ticketed `arvn-evolved` opt-in substrate recorded by `tickets/179ACTSELPRE-005.md`.
- Four WASM timing/stat probe tests were updated as same-package verification fallout after the ticket-named engine test lane exposed package-cwd subprocess-output assumptions. Their subprocess probes now receive the repo root and write JSON to an explicit temp file, preserving the existing child-process boundary while making the package script lane deterministic.
- `specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` and `tickets/180STDVECOBSROL-003.md` now record the Phase 1/Phase 2 ownership split.

Post-review correction:

- `$post-ticket-review` found a duplicate-ref edge in the base no-silent-zero repair: unique unknown-ref map size was not enough to detect a later all-unavailable `seatAgg(sum)` when the same preview ref had already been marked unknown earlier in the candidate. `packages/engine/src/agents/policy-evaluation-core.ts` now tracks unknown-preview events, and the preview-integrity regression primes that duplicate-ref case.

Generated/schema fallout: none expected. No schema source, generated schema artifact, trace shape, or public authored `seatAgg.availability` API changed in this ticket.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-preview.ts` | 1363 | 1363 | no; preexisting over cap | 0 | One-line status substitution only; no active growth in oversized file. | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2247 | 2246 | no; preexisting over cap | -1 | Local evaluator change, including post-review duplicate-ref hardening, was kept net-negative to avoid active growth in oversized file. | none |
| `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts` | 26 | 34 | no | +8 | Same-package verification fallout; small test expectation correction under cap. | none |
| `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts` | 272 | 287 | no | +15 | Small fixture fallback addition plus post-review duplicate-ref priming support; under cap. | none |
| `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` | 26 | 30 | no | +4 | Focused regression rewrite; under cap. | none |
| `packages/engine/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.ts` | 185 | 197 | no | +12 | Same-package verification fallout; package-cwd subprocess output repair under cap. | none |
| `packages/engine/test/unit/agents/policy-wasm-serialization-stats.test.ts` | 153 | 165 | no | +12 | Same-package verification fallout; package-cwd subprocess output repair under cap. | none |
| `packages/engine/test/unit/agents/policy-wasm-timing-flag.test.ts` | 157 | 169 | no | +12 | Same-package verification fallout; package-cwd subprocess output repair under cap. | none |
| `packages/engine/test/integration/policy-wasm-timing-profile-batch-size.test.ts` | 88 | 100 | no | +12 | Same-package verification fallout; package-cwd subprocess output repair under cap. | none |

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `pnpm -F @ludoforge/engine build` | run directly | passed before focused witnesses, final package lane, and post-review focused reruns |
| Test Plan | Focused compiled `node --test` witness command | replaced by repo-valid package exec compiled Node runner | passed after post-review cleanup: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.js` |
| Test Plan | Focused preview-integrity regression | added from ticket acceptance after boundary reset | passed after post-review cleanup: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.js` |
| Verification fallout | `preview-config-back-compat/old-profiles-compile.test.ts` direct rerun | added after package lane exposed stale Spec 179 expectation | passed: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-config-back-compat/old-profiles-compile.test.js` |
| Verification fallout | package-cwd WASM stats probe direct reruns | added after package lane exposed package-cwd subprocess-output assumptions | passed: `cd packages/engine && node --test dist/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.js`; `cd packages/engine && node --test dist/test/unit/agents/policy-wasm-serialization-stats.test.js`; `cd packages/engine && node --test dist/test/unit/agents/policy-wasm-timing-flag.test.js` |
| Verification fallout | package-cwd WASM integration timing probe direct rerun | added after package lane exposed package-cwd subprocess-output assumptions | passed: `cd packages/engine && node --test dist/test/integration/policy-wasm-timing-profile-batch-size.test.js` |
| Test Plan | `pnpm -F @ludoforge/engine test` | run directly after post-review cleanup | passed: default lane summary `92/92 files passed`; per-file class-summary advisory text remained reporter-only and did not mark failures |
| Test Plan | `pnpm run check:ticket-deps` | run directly after terminal status update | passed: `Ticket dependency integrity check passed for 8 active tickets and 2402 archived tickets.` |
| Post-review archival | `pnpm run check:ticket-deps` | run directly after archival and active/spec path cleanup | passed: `Ticket dependency integrity check passed for 7 active tickets and 2403 archived tickets.` |

AGENTS canonical lane reconciliation:

| AGENTS canonical lane | required by ticket? | ran/subsumed/not applicable | rationale |
| --- | --- | --- | --- |
| `pnpm turbo build` | no | not applicable | ticket names engine package build and package test; changed surface is engine-local |
| `pnpm turbo test` | no | not applicable | package-local engine test is the explicit broad acceptance lane |
| `pnpm turbo lint` | no | not applicable | no lint lane named; TypeScript build and engine test cover the changed engine/test sources |
| `pnpm turbo typecheck` | no | not applicable | engine build runs `tsc` for the package |
| `pnpm turbo schema:artifacts` | no | not applicable | no schema-bearing source changed |

Late reset proof validity: the focused green runs happened after the active ticket/spec/sibling boundary reset was patched. `$post-ticket-review` added a same-scope duplicate-ref hardening cleanup and reran `pnpm -F @ludoforge/engine build`, both focused Spec 180 witnesses, and `pnpm -F @ludoforge/engine test` after that cleanup. This final ticket edit only records already-run proof and status, so it does not invalidate the package-lane result.
