# 143BOURUNMEM-003: Canonical-identity compaction for oversized serialized retained structures

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel chooseN canonical-identity helpers and witness-search probe caching. Exact surface refined against 002's authoritative classification.
**Deps**: `archive/tickets/143BOURUNMEM-002.md`, `archive/tickets/143BOURUNMEM-008.md`

## Problem

Spec 143 Design Section 2 says serialized payloads are not acceptable live identities when smaller canonical forms exist. Ticket 002's authoritative classification narrowed where that still applies on the live repo:

- `decisionStackFrame` Zobrist keys are already compact digests
- policy preview/evaluation contexts are already keyed by compact `stableMoveKey`
- chooseN session caches already use `SelectionKey`

The remaining live 003 seam is chooseN witness-search probe caching in `packages/engine/src/kernel/choose-n-option-resolution.ts`, which still maintains its own sorted-string selection-key path instead of the shared chooseN canonicalization. That fallback string path can retain oversized raw option payloads for large domains when a smaller canonical index-based form already exists.

## Assumption Reassessment (2026-04-23)

1. The chooseN session caches (`probeCache`, `legalityCache`) at `packages/engine/src/kernel/choose-n-session.ts:292-293` already use `SelectionKey`, and 002 classifies them as compact enough for the current audit.
2. The `decisionStackFrame` Zobrist encoding already uses a bounded `digest` field (confirmed at `zobrist.ts:136-137`), and 002 classifies policy preview cache keys as already compact via `stableMoveKey`.
3. The remaining live 003 seam is the chooseN witness-search probe cache in `packages/engine/src/kernel/choose-n-option-resolution.ts`, which still maintained its own sorted-string selection key instead of the shared compact canonicalization.
4. Foundation 13 (Artifact Identity and Reproducibility): canonical-form key changes here must leave GameDef hashes, replay fixtures, and externally observable state hashes bit-identical. The determinism corpus is the proof surface.

## Architecture Check

1. **Pattern extension, not new invention**: 002 already established `SelectionKey` as the compact canonical representation for chooseN session caches. This ticket reuses that same representation for witness-search probe caching instead of keeping a second raw-string encoding path.
2. **Agnostic boundaries preserved**: all live changes are in `packages/engine/src/kernel/` plus focused engine tests. No game-specific logic or agent-only branches are introduced (Foundation 1).
3. **Foundation 13 preserved**: the change is internal to transient cache-key representations; externally observable state hashes and replay identity remain unchanged. The determinism corpus remains the authoritative proof.
4. **No backwards-compatibility shims** (Foundation 14): the old string-key helper path is removed rather than preserved in parallel.

## What to Change

### 1. Shared chooseN canonical key helper

Extract the chooseN `SelectionKey` canonicalization into a shared kernel helper so both session caches and witness-search probe caching use the same bounded representation.

### 2. Witness-search probe cache compaction (`packages/engine/src/kernel/choose-n-option-resolution.ts`)

Replace the local sorted-string `probeCache` key path with the shared compact canonical form. For larger domains, the fallback key must be derived from stable domain indices rather than raw option payload strings.

### 3. Focused boundedness tests

Add focused engine tests proving the shared canonical helper does not retain oversized raw option payloads in its fallback encoding and remains deterministic/order-independent across session and witness-search usage.

### 4. Determinism corpus validation

Run the determinism-tier engine proof after the cache-key refactor to confirm replay identity is unchanged.

## Files to Touch

- `packages/engine/src/kernel/choose-n-selection-key.ts` (new) — shared compact canonicalization for chooseN selection keys
- `packages/engine/src/kernel/choose-n-session.ts` (modify) — consume the shared helper
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify) — witness-search probe-cache key construction
- `packages/engine/test/unit/kernel/choose-n-selection-keys.test.ts` (modify) — shared-helper coverage
- `packages/engine/test/unit/kernel/choose-n-session.test.ts` (modify) — import/update shared helper seam
- `packages/engine/test/unit/kernel/canonical-identity-bounds.test.ts` (new) — focused bounded canonical-identity regression

## Out of Scope

- Scope-boundary drop/reset enforcement (covered by 004) — this ticket does not change when a cache or helper is dropped, only the shape of its keys.
- Decision-stack frame field split into persistent-authoritative vs decision-local-transient (covered by 004 per spec Section 6) — this ticket addresses identity shape, not lifetime class.
- New long-run advisory witnesses (covered by 005/006/007).

## Acceptance Criteria

### Tests That Must Pass

1. Determinism-tier engine proof: `pnpm -F @ludoforge/engine test:determinism` — replay identity must remain bit-identical before and after the canonical-identity change.
2. Engine unit suite: `pnpm -F @ludoforge/engine test:unit`.
3. The new focused boundedness tests prove the shared chooseN canonical key does not retain oversized raw option payloads when a smaller canonical index form exists.
4. Any existing test that constructed the old helper path directly is migrated to the shared helper in the same commit (Foundation 14).

### Invariants

1. No chooseN probe-cache key retains full raw option payload strings when a bounded canonical form exists.
2. GameDef hashes, replay fixtures, and externally observable zobrist/state hashes are bit-identical before and after.
3. Selection-key size is bounded by domain structure rather than raw option payload size.
4. Foundation 1: no FITL-specific branch introduced by the canonicalization logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/canonical-identity-bounds.test.ts` (new) — focused regression asserting the shared chooseN canonical key remains compact even when option payload strings are oversized.
2. `packages/engine/test/unit/kernel/choose-n-selection-keys.test.ts` (modified) — fallback-key regression proving large-domain keys use stable domain indices instead of raw option payload strings.
3. `packages/engine/test/unit/kernel/choose-n-session.test.ts` (modified) — import/update the shared helper seam.

### Commands

1. Build: `pnpm -F @ludoforge/engine build`
2. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/choose-n-selection-keys.test.js dist/test/unit/kernel/choose-n-session.test.js dist/test/unit/kernel/canonical-identity-bounds.test.js`
3. Determinism-tier proof: `pnpm -F @ludoforge/engine test:determinism`
4. Package checks: `pnpm -F @ludoforge/engine test:unit`, `pnpm -F @ludoforge/engine lint`, `pnpm -F @ludoforge/engine typecheck`

## Outcome

Outcome amended: 2026-04-24

- Implemented: extracted shared chooseN canonical key logic into `packages/engine/src/kernel/choose-n-selection-key.ts` and switched witness-search probe caching to that shared compact representation.
- Implemented: large-domain fallback keys now use stable domain indices rather than raw option payload strings, so oversized chooseN values no longer get retained verbatim in probe-cache identity.
- Implemented: added focused boundedness coverage in `packages/engine/test/unit/kernel/canonical-identity-bounds.test.ts` and extended existing selection-key tests to pin the non-raw fallback encoding.
- Prior blocker resolved: `archive/tickets/143BOURUNMEM-008.md` fixed the remaining medium-diverse FITL determinism OOM in the live runtime path, and `pnpm -F @ludoforge/engine test:determinism` now passes.
- Remaining ownership after closeout: `tickets/143BOURUNMEM-005.md` and `tickets/143BOURUNMEM-006.md` remain the later advisory heap/cost witness tickets; they no longer block 003 acceptance.

- ticket corrections applied: `broader 002 follow-on surface -> remaining live 003 seam is shared chooseN selection-key compaction plus witness-search probe-cache migration`; `draft-state determinism OOM blocker -> current blocker is medium-diverse FITL Zobrist property OOM after earlier determinism files pass`
- verification set: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/choose-n-selection-keys.test.js dist/test/unit/kernel/choose-n-session.test.js dist/test/unit/kernel/canonical-identity-bounds.test.js`; `pnpm -F @ludoforge/engine typecheck`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine test:unit` (returns `0 tests` under the current package script in this environment); `pnpm -F @ludoforge/engine test:determinism`
- proof closure: `pnpm -F @ludoforge/engine test:determinism` is now green after 008's runtime fix, so this ticket's determinism-tier acceptance proof is satisfied.
