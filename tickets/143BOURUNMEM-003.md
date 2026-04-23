# 143BOURUNMEM-003: Canonical-identity compaction for oversized serialized retained structures

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel (chooseN session, zobrist, microturn types), agents (policy preview). Exact surface refined against 002's authoritative classification.
**Deps**: `tickets/143BOURUNMEM-002.md`

## Problem

Spec 143 Design Section 2: "Serialized payloads are not acceptable live identities when smaller canonical forms exist. The engine must not use full serialized decision/context/pipeline payloads as long-lived live identities unless the serialization is itself the minimal canonical state artifact." The spec cites specific examples (full serialized decision-stack frames retained as cache keys; preview/session/cache keys that embed large replay-like payloads or whole parameter documents when a smaller canonical projection would uniquely identify the same semantic boundary). 002's authoritative classification flags the specific offending sites.

This ticket replaces the flagged oversized identities with bounded canonical forms. The existing `decisionStackFrame` Zobrist feature already exemplifies the pattern: `packages/engine/src/kernel/zobrist.ts:136-137` encodes frames as `kind=decisionStackFrame|slot=${feature.slot}|digest=${feature.digest}` — a compact, bounded digest rather than a full serialized frame string. The spec's Problem section notes that change "removed real waste but did not solve the OOM"; extending the same pattern to the remaining oversized identities is the goal here.

## Assumption Reassessment (2026-04-23)

1. The chooseN caches (`probeCache`, `legalityCache`) at `packages/engine/src/kernel/choose-n-session.ts:292-293` use `SelectionKey` as the map key — whether that key is itself compact or a serialized form of selection state is a detail 002 classifies.
2. The `decisionStackFrame` Zobrist encoding already uses a bounded `digest` field (confirmed at `zobrist.ts:136-137`). This is the precedent pattern this ticket extends.
3. Foundation 13 (Artifact Identity and Reproducibility): canonical-form keys MUST preserve replay identity. Any change here must leave GameDef hashes, replay fixtures, and zobrist-derived keys bit-identical — only the internal cache key shape changes, not the externally observable state hash. Determinism corpus at `packages/engine/test/determinism/` is the proof surface.
4. Spec 143 Foundations Alignment explicitly surfaces this Foundation 13 constraint.

## Architecture Check

1. **Pattern extension, not new invention**: the `decisionStackFrame` digest pattern (bounded canonical identity over what was previously a full serialization) is the architectural template. Extending it to other retained identities flagged by 002 uses a known, tested pattern rather than a greenfield design.
2. **Agnostic boundaries preserved**: all changes are in `packages/engine/src/kernel/` and `packages/engine/src/agents/` — no per-game branches introduced. Canonicalization logic is generic over the identity shape (Foundation 1).
3. **Foundation 13 preserved**: canonical-identity changes are internal to cache-key representations; the externally observable state hash (used by replay fixtures and GameDef identity) must remain bit-identical. The determinism test corpus is the authoritative proof.
4. **No backwards-compatibility shims** (Foundation 14): old oversized-key code paths are removed outright; cache-key shapes are changed atomically across their owning module and consumers. If a cache is serialized or persisted across runs, the change must include matching updates to any serialized fixture.
5. **Reviewability under mechanical uniformity**: if the audit flags multiple cache-key sites with the same refactor shape (replace full serialization with compact digest), the diff can be Large but reviewable per the Foundation 14 mechanical-uniformity exception.

## What to Change

The exact per-structure work is refined against 002's audit findings. At minimum, expect these areas:

### 1. ChooseN cache keys (`packages/engine/src/kernel/choose-n-session.ts`)

If 002 flags `probeCache` or `legalityCache` `SelectionKey` shape as oversized, replace the serialized form with a compact canonical form (e.g., structural id + bounded parameter fingerprint). Update all construction and lookup sites atomically.

### 2. Policy preview / evaluation context keys (`packages/engine/src/agents/policy-preview.ts`)

If 002 flags policy preview context retention as holding oversized serialized state, replace with the bounded canonical projection (typically: scope id + bounded decision-context digest).

### 3. Zobrist feature encoding (`packages/engine/src/kernel/zobrist.ts`)

If 002 surfaces additional Zobrist features whose encoded identity still uses full serialization (beyond the already-compacted `decisionStackFrame`), extend the digest pattern. Verify the `keyCache` bound is independent of simulation length, not decision count.

### 4. Decision-stack frame field identity (`packages/engine/src/kernel/microturn/types.ts`)

If 002 flags any `DecisionStackFrame` field as retained identity that should be a bounded projection (e.g., `accumulatedBindings` redundantly serialized elsewhere), remove the redundancy and keep only the canonical form. Note: the broader field-split work (continuation-required vs preview/search) is 004's scope — this ticket addresses **identity** compaction, not **scope** reclassification.

### 5. Determinism corpus validation (every sub-change above)

After each canonical-identity change, run `packages/engine/test/determinism/` to assert replay identity is preserved. Any determinism regression is a Foundation 13 violation and blocks the ticket.

## Files to Touch

Exact list depends on 002's classification. Likely surface:

- `packages/engine/src/kernel/choose-n-session.ts` (modify) — cache key shapes
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify) — option-resolution key construction
- `packages/engine/src/agents/policy-preview.ts` (modify) — context identity compaction
- `packages/engine/src/kernel/zobrist.ts` (modify) — additional feature digests if flagged
- `packages/engine/src/kernel/microturn/types.ts` (modify) — redundant identity fields if flagged
- `packages/engine/test/` (modify) — any existing tests that construct the old key shape directly (blast radius from 002's audit)

## Out of Scope

- Scope-boundary drop/reset enforcement (covered by 004) — this ticket does not change when a cache or helper is dropped, only the shape of its keys.
- Decision-stack frame field split into persistent-authoritative vs decision-local-transient (covered by 004 per spec Section 6) — this ticket addresses identity shape, not lifetime class.
- New witness tests (covered by 005/006/007).

## Acceptance Criteria

### Tests That Must Pass

1. Full determinism corpus: `pnpm -F @ludoforge/engine test:e2e` (or the equivalent determinism-tier command) — replay identity must be bit-identical before and after the canonical-identity changes.
2. Full engine suite: `pnpm -F @ludoforge/engine test:all`.
3. No regression in replay fixtures under `packages/engine/test/fixtures/` — stored state hashes and zobrist-derived keys remain unchanged.
4. Any existing test that constructed the old key shape directly is migrated to the new shape in the same commit (Foundation 14).

### Invariants

1. No long-lived engine cache key retains a full serialized decision/context/pipeline payload when a bounded canonical form exists.
2. GameDef hashes, replay fixtures, and externally observable zobrist keys are bit-identical before and after.
3. Cache-key size is bounded by the feature domain, not by simulation length or decision count.
4. Foundation 1: no FITL-specific branch introduced by the canonicalization logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/canonical-identity-bounds.test.ts` (new) — property test asserting that for a growing simulation, cache-key byte length stays bounded (not proportional to state size or decision count). Engine-generic test construction; not FITL-specific.
2. Migrate any existing test that constructs the old key shape to the new shape (blast radius depends on 002).

### Commands

1. Targeted: `pnpm -F @ludoforge/engine test -- --test-name-pattern=canonical-identity`
2. Full determinism: `pnpm -F @ludoforge/engine test:e2e`
3. Full suite: `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`
