# 143BOURUNMEM-002: Lifetime-class audit and authoritative classification

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — audit + documentation only; no engine source changes
**Deps**: `archive/tickets/143BOURUNMEM-001.md`

## Problem

Spec 143 Section 1 introduces three lifetime classes (`persistent-authoritative`, `run-local-structural`, `decision-local-transient`) and includes a **non-binding** classification table mapping 8 retained runtime support structures to their intended class. The spec explicitly notes: "The audit proposed in Required Changes is the process by which this table becomes authoritative." Without that authoritative audit, downstream tickets (003 canonical-identity compaction, 004 scope-boundary enforcement) have no agreed-upon per-structure target — each would need to re-derive the classification independently, creating drift risk and duplicate work.

This ticket consumes 001's heap-snapshot evidence and produces the authoritative classification as a checked-in architecture doc. The classification converts the spec's starter table into an evidence-backed contract and becomes the reference for 003 and 004.

## Assumption Reassessment (2026-04-23)

1. The 8 structures listed in the spec's Section 1 table still exist on `main` with the cited shapes. Confirmed during spec-143 reassessment: `DecisionStackFrame.accumulatedBindings` at `packages/engine/src/kernel/microturn/types.ts:205-212`, `zobristTable.keyCache` at `packages/engine/src/kernel/zobrist.ts:218`, chooseN `probeCache`/`legalityCache` at `packages/engine/src/kernel/choose-n-session.ts:292-293`, token-state index at `packages/engine/src/kernel/token-state-index.ts`, policy preview contexts at `packages/engine/src/agents/policy-preview.ts`.
2. Spec 141's `GameDefRuntime` run-boundary contract is already live and its structural tables are classified as `run-local-structural` by the spec's own starter table — the audit confirms or corrects the inherited classification rather than re-deriving it from scratch.
3. Ticket 001's heap snapshot provides the retained-population evidence needed to validate each row's class. If 001 surfaces a top-N retainer not in the spec's table, 002 extends the table to cover it (per 001's Invariant #2).

## Architecture Check

1. **Evidence-backed classification over prose description**: a checked-in doc with per-structure evidence lets future changes target the contract explicitly (Foundation 15 — architectural completeness). The spec's prose description alone invites re-interpretation on every future audit.
2. **Agnostic boundaries preserved**: the doc describes engine-generic structures; no FITL-specific classifications (Foundation 1). Classification rows cite source paths under `packages/engine/`, not any specific game's YAML.
3. **No backwards-compatibility shims**: documentation-only ticket; nothing deprecated.
4. **Natural home**: the classification belongs in a dedicated `docs/architecture-memory.md` or as a new top-level section of `docs/architecture.md`. The implementer should confirm the repo's existing convention during implementation — if `docs/architecture.md` already has a runtime-ownership section, extending it is preferable to creating a sibling file.

## What to Change

### 1. Read each cited structure's definition + usage

For each of the 8 structures in the spec's Section 1 table, read:

- Type definition (captures field shape)
- Construction sites (captures lifecycle start)
- Retention sites (captures what holds a reference across scope boundaries)
- Drop/reset sites (captures lifecycle end — or absence thereof, which is itself the finding)

Record file paths and line ranges for each.

### 2. Cross-reference against 001's heap snapshot

For each structure, check 001's top-N retainer table:

- Does the structure appear as a top-N retainer? (confirms retained-population significance)
- Does its retained size grow with decision count? (confirms lifetime-class problem)
- Is its construction-rate proportional to decision count? (supports `decision-local-transient` classification)

If the structure does NOT appear in the top-N list, note that its classification is based on code-reading evidence alone (not heap pressure) and flag it as lower-priority for 003/004.

### 3. Produce authoritative classification document

Write a doc with this structure:

- Section: "Lifetime classes" — definitions of `persistent-authoritative`, `run-local-structural`, `decision-local-transient` (copy from Spec 143 Section 1 verbatim for reader convenience)
- Section: "Authoritative classification" — one subsection per structure, each containing:
  - Structure name + source path + line range
  - Confirmed class: `<class>` (OR discrepancy note: "spec proposed `<X>`; audit finds `<Y>` because …")
  - Lifecycle start: construction site(s)
  - Lifecycle end: drop/reset site(s), or explicit gap note "no drop-at-scope-exit yet — 004 target"
  - Canonical identity status: "compact" or "oversized serialized — 003 target"
  - Heap-snapshot evidence: reference to 001's top-N row or "not in top-N; classification from code reading"
- Section: "Audit gaps" — any top-N retainer from 001 that was not in the spec's starter table; each needs a class assignment and a follow-up ticket pointer (or a note that it is already covered by 003/004's scope).

### 4. Update Spec 143 (optional follow-up)

If the audit surfaces classification discrepancies with Spec 143 Section 1's starter table, open a brief spec amendment adding a note: "The authoritative classification lives in `docs/architecture-memory.md`; Section 1's table is a non-binding starter." Do NOT rewrite the spec's table inline — the doc is the source of truth going forward.

## Files to Touch

- `docs/architecture-memory.md` (new) — authoritative classification document. If `docs/architecture.md` already exposes a "Runtime state ownership" top-level section, instead extend it in place and note the choice in the Architecture Check section of the commit message.
- `reports/spec-143-heap-snapshot.md` (modify, optional) — if audit surfaces gaps, append a short "Classification extensions" section referencing the new doc.
- `specs/143-bounded-runtime-memory-and-simulation-cost.md` (modify, optional) — note about authoritative doc, only if discrepancies were found.

## Out of Scope

- Any engine source code changes — 003 and 004 consume this audit and drive the actual work.
- Reclassifying structures listed as `persistent-authoritative` (e.g., `GameState` fields) — those are already bounded and are not what this spec targets.
- Advisory CI witness tests — 005/006.

## Acceptance Criteria

### Tests That Must Pass

1. Manual review: each row of the spec's Section 1 starter table has a corresponding subsection in the new doc with the four required evidence fields (source, lifecycle start/end, canonical-identity status, heap evidence).
2. Any top-N retainer from 001 has a row in the authoritative classification (either existing-and-confirmed or newly added with a class assignment).
3. Existing suite: `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck` — ticket changes no engine source, so no regressions.

### Invariants

1. Every cited structure has a class assignment backed by either heap-snapshot evidence or code-reading evidence (no unexplained rows).
2. Structures classified as `decision-local-transient` each have either a documented drop-at-scope-exit site OR an explicit gap note identifying 004 as the owner.
3. Structures classified as `run-local-structural` each cite their run-boundary owner (typically Spec 141's `GameDefRuntime` contract).

## Test Plan

### New/Modified Tests

1. No new tests — audit + documentation only.
2. Reviewer cross-check: read the new doc against Spec 143 Section 1 and Ticket 001's report.

### Commands

1. `pnpm turbo typecheck` — no engine source changed, should pass.
2. `pnpm turbo lint` — doc-only changes should not introduce lint errors.
3. Full suite sanity: `pnpm turbo test`.
