# 194ZOBDECSTA-001: Field-irrelevance audit for decision-stack frame digest

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — audit/report only
**Deps**: `archive/tickets/194ZOBDIGEST-001.md`, `specs/194-zobrist-decision-stack-digest-optimization.md`

## Problem

Spec 194 Phase 1 (`archive/tickets/194ZOBDIGEST-001.md`, COMPLETED 2026-05-25) selected lever **2B — Encoded-surface reduction** per the §4.2 decision matrix. Phase 1 evidence (`reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`): aggregate mean encoded chars per miss is **23 647.62** (target trigger >~2 KB; matched ×11), aggregate encode total is **44 355.641 ms** vs FNV-1a digest total **82 289.213 ms**, encode-call rate **32.72%**. Encoded-surface reduction is the only lever that addresses both the JSON-encode cost (proportional to encoded surface) and the FNV-1a cost (proportional to encoded length).

Per Spec 194 §4.2 lever 2B row, applying the reduction requires "an explicit field-irrelevance audit" before any source change. This ticket delivers that audit as a standalone checked-in artifact so Phase 2 implementation (ticket `tickets/194ZOBDECSTA-002.md`) lands on a reviewed proof rather than authoring the audit during the same change that bumps the canonical Zobrist encoding. Splitting the audit from the F#14 atomic implementation cut keeps the audit reviewable in isolation and gives the implementation ticket a single concrete Drop/Keep field list.

## Assumption Reassessment (2026-05-25)

1. **Encoded surface verified**: `encodeDecisionStackFrameDigestInput` at `packages/engine/src/kernel/zobrist.ts:174-194` `JSON.stringify`s the following keys at HEAD: `parentFrameDigest`, `frameId`, `parentFrameId`, `turnId`, `context`, optional `continuationBindings`, and `effectFrame` substructure: `programCounter`, `boundedIterationCursors`, `localBindings`, `pendingTriggerQueue`, optional `decisionHistory`, optional `suspendedFrame` (passed through `summarizeSuspendedFrameForDigestCache` at `zobrist.ts:160-172`).
2. **Existing in-state representation**: `DecisionStackFrame` at `packages/engine/src/kernel/microturn/types.ts:231-247` and `EffectExecutionFrameSnapshot` at `packages/engine/src/kernel/microturn/types.ts:66-73` define every field referenced in the encoded surface. The audit operates against these source-of-truth shapes.
3. **`decisionHistory` consumer surface** (verified by `grep -rn "decisionHistory" packages/engine/src/`): `microturn/apply.ts` (L44, L299, L551), `microturn/drive.ts` (L43, L186, L392), `microturn/publish.ts` (L281, L943, L949), `kernel/serde.ts` (L85, L96), `kernel/schemas-core.ts` (L2121). The field is reconstructed-from-trace at every step, so its presence inside the digest is **observation-derivable** — equal trajectory ⇒ equal `decisionHistory` content ⇒ digest does not need it as a primary discriminator. The audit must formally verify this for each candidate Drop field.
4. **`pendingTriggerQueue` consumer surface**: `microturn/drive.ts:106`, `microturn/apply.ts:131`, `microturn/publish.ts:948`, `kernel/serde.ts:84,95`, `kernel/schemas-core.ts:2120`. Always `[]` at publish time and rebuilt during execution from the active turn-flow context.
5. **`continuationBindings` consumer surface**: `effects-control.ts:381`, `microturn/continuation-bindings.ts:12`, `microturn/drive.ts:195,202,205,214,389,473,474`, `microturn/apply.ts:308,315,318,327,548,632,633`, `serde.ts:108,120`, `schemas-core.ts:2290`. Root-frame-only continuation payload per the `DecisionStackFrame` docblock at `microturn/types.ts:236-244`.
6. **Phase 1 trigger evidence applies**: the Phase 1 hypothesis-refinement showed H3 (`JSON.stringify` dominates per-call cost on cache miss) was `refined`, not refuted. Audit's job is to identify which fields contribute to that cost but do not contribute to canonical state identity.
7. **Spec 194 sacred guarantee**: per spec §2 Non-Goals: "No change to the canonical Zobrist key value for any game state within a given kernel version." A Drop verdict per field requires proof that the dropped field's value is **derivable from the kept fields plus the current `GameState`**, i.e., two structurally-distinct game states cannot map to identical kept-field shapes without also being equal under the dropped field. The audit must show this for every Drop candidate.
8. **Existing Spec 168 architectural-invariant test must remain intact**: `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` proves cache-hit/miss/recompute equivalence. The audit verifies that any proposed encoded-surface reduction does not invalidate that test's property at the next kernel version.

## Architecture Check

1. **Pure analytical artifact — zero engine source drift**: deliverable is one new markdown report. No changes to `packages/engine/src/`, `packages/engine/test/`, or any fixture. Canonical Zobrist key output is byte-identical pre- and post-ticket; the Foundation #8 sacred guarantee is preserved by construction (no behavioral change). This is the gate evidence that `tickets/194ZOBDECSTA-002.md` consumes; it does not itself implement any reduction.
2. **Audit per-field independence** preserves Foundation #15 (architectural completeness): rather than guessing which fields to drop, the audit proves field-irrelevance via consumer-graph analysis grounded in the codebase, so the Phase 2 implementation knows exactly which fields to remove and why each removal is safe.
3. **No backwards-compatibility aliasing/shims introduced**: deliverable is one new file. Nothing wrapped, aliased, or marked deprecated.

## What to Change

### 1. New audit report `reports/audits/zobrist-encoded-surface-field-irrelevance-<YYYY-MM-DD>.md`

Filename date set at run time (YYYY-MM-DD format matching the Phase 1 report). Required sections:

1. **Encoded-surface inventory** — enumerate every field currently in `encodeDecisionStackFrameDigestInput` (`zobrist.ts:174-194`) plus the `summarizeSuspendedFrameForDigestCache` substructure (`zobrist.ts:160-172`). For each field, record: source-of-truth type location, optionality, in-state population pattern (when the field is set / cleared / mutated), and call-graph reference list.
2. **Per-field Drop/Keep verdict** — for each field, one of `KEEP` / `DROP-PROVEN-IRRELEVANT` / `DROP-DERIVABLE-FROM-KEPT-FIELDS`, with a one-paragraph proof argument citing source lines. The verdict body must answer:
   - Does any reachable game state distinguish two frames by this field alone (no other kept-field divergence)? If yes → `KEEP`.
   - Is the field's value derivable from the kept-field shape plus current `GameState`? If yes → `DROP-DERIVABLE-FROM-KEPT-FIELDS`.
   - Is the field observation-only / publish-only / always-`[]` at digest time? If yes → `DROP-PROVEN-IRRELEVANT`.
3. **Cross-check against Spec 80 incremental contract** — confirm each Drop candidate does not invalidate the Spec 80 incremental Zobrist contract (`archive/specs/80-incremental-zobrist-hashing.md`): if kernel state mutations produce incremental updates that reference any Drop field, the field must be `KEEP` regardless of other arguments.
4. **Cross-check against Spec 168 cache equivalence** — confirm each Drop candidate does not invalidate `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`: cache-hit and cache-miss must still produce the same digest at the new encoding.
5. **Encoded-surface size projection** — compute the expected mean encoded-chars-per-miss after Drop verdicts are applied. The Phase 1 baseline is 23 647.62 chars/miss; project the post-reduction figure using actual field-size statistics from the Phase 1 raw counters (`zobrist:decisionStackFrameEncodedChars`) cross-referenced against the dropped fields' typical structural footprint (e.g., `decisionHistory` length ≈ trace depth × per-entry size).
6. **Final Drop field list** — a single bulleted list naming exactly the fields the Phase 2 implementation will remove from `encodeDecisionStackFrameDigestInput`. Each entry quotes the verdict from §2 and references the proof paragraph.
7. **Risk-and-residual section** — call out any fields that are `KEEP` solely because the proof is incomplete (i.e., further investigation would be required to safely drop them). These do not contribute to the Phase 2 cut but document the audit's frontier.

### 2. Determinism verification (post-audit-author)

Confirm zero regression in the three existing proof surfaces named in spec §6:

- Replay-identity corpus (`packages/engine/test/determinism/`) — 100% green.
- Spec 168 frame-digest-cache equivalence (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) — 100% green.
- Spec 192 trajectory-identity (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) — 100% green across all six workloads.

Pure observation cannot regress these; the verification confirms the contract.

## Files to Touch

- `reports/audits/zobrist-encoded-surface-field-irrelevance-<YYYY-MM-DD>.md` (new; filename date set at run time)

## Out of Scope

- **Any change to `packages/engine/src/kernel/zobrist.ts` or any other source/test file** — this ticket is observation-only. The implementation of the Drop verdicts is owned by `tickets/194ZOBDECSTA-002.md`.
- **Kernel-version bump / reproducibility-metadata edits** — the version bump is a side-effect of the Drop application; both belong in `tickets/194ZOBDECSTA-002.md` per Foundation #14 atomic-cut discipline.
- **Replay-corpus re-bless** — same as above; owned by `tickets/194ZOBDECSTA-002.md`.
- **Phase 3 perf witness re-capture** — owned by `tickets/194ZOBDECSTA-003.md`, gated on `tickets/194ZOBDECSTA-002.md` landing.
- **Engine-WASM Zobrist** — out of scope per spec §2 (no Rust Zobrist implementation exists in `packages/engine-wasm/policy-vm/`; canonical keys are TS-only).
- **New automated tests** — this ticket is an audit deliverable; the existing determinism corpus is the safety net and stays green by construction (no code change).

## Acceptance Criteria

### Tests That Must Pass

1. Existing replay-identity corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green (no behavioral change introduced).
2. Existing Spec 168 frame-digest-cache equivalence test (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) runs unchanged — 100% green.
3. Existing Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) runs unchanged across all six workloads.
4. Full engine suite: `pnpm -F @ludoforge/engine run test` — 100% green.

### Invariants

1. **Zero engine source drift**: `git diff packages/engine/src/ packages/engine/test/` is empty after the ticket lands — this ticket is observation-only.
2. **Audit report format**: the report conforms to the seven required sections in §What to Change item 1 (inventory, per-field verdict, Spec 80 cross-check, Spec 168 cross-check, size projection, final Drop list, risk-and-residual).
3. **Drop list is non-empty**: the audit yields at least one `DROP-*` verdict; if the audit concludes every field is `KEEP`, lever 2B is structurally infeasible and the spec must be re-evaluated against the §4.2 matrix (notify the user per the 1-3-1 rule).
4. **Per-field proof traceability**: every `DROP-*` verdict cites at least one source-line reference proving the field is irrelevant or derivable.

## Test Plan

### New/Modified Tests

1. No new automated tests — this is an audit deliverable per spec §9 ("Phase 2 levers' correctness is proven by the existing replay-identity corpus + Spec 168 equivalence test plus any lever-specific architectural-invariant test (§9)"). The audit itself is reviewed; the new architectural-invariant test (`zobrist-canonical-key-byte-identity.test.ts`) lands in `tickets/194ZOBDECSTA-002.md` alongside the actual code change.
2. Manual end-to-end verification: read the audit report, confirm each field has a verdict + proof, confirm the Final Drop list is non-empty and traceable, confirm size projection is computed from actual Phase 1 counter values.

### Commands

1. Build engine (sanity check): `pnpm turbo build`.
2. Verify zero engine source drift: `git diff packages/engine/src/ packages/engine/test/` — must be empty.
3. Verify existing test suites green: `pnpm -F @ludoforge/engine run test`.
4. Lint + typecheck (project canonical): `pnpm turbo lint typecheck`.
5. Verify ticket dependency graph: `pnpm run check:ticket-deps`.

## Outcome

Completed: 2026-05-25

This ticket produced the standalone audit report at `reports/audits/zobrist-encoded-surface-field-irrelevance-2026-05-25.md`. The audit keeps all rule-authoritative frame identity, continuation-binding, control/resume, suspended-frame, and active-context fields, and yields a nonempty Drop list for ticket `tickets/194ZOBDECSTA-002.md`:

- `effectFrame.pendingTriggerQueue` — `DROP-PROVEN-IRRELEVANT`; current digest-time active frames always encode `[]`.
- `effectFrame.decisionHistory` — `DROP-PROVEN-IRRELEVANT`; observation-only compound-turn trace accumulator, removed only under the v2 digest-version bump owned by `tickets/194ZOBDECSTA-002.md`.

No engine source, engine tests, schemas, fixtures, replay artifacts, or kernel-version metadata changed in this ticket. The audit's encoded-size projection is explicitly approximate; Phase 3 remains responsible for measured perf recapture.

Verification:

- `git diff packages/engine/src/ packages/engine/test/` — empty.
- `pnpm turbo build` — passed; Turbo cache replay across 3/3 packages, acceptable as sanity proof because this ticket changed only markdown/state artifacts and no executable source, test, schema, generated runtime artifact, or package manifest.
- `pnpm -F @ludoforge/engine run test` — passed; schema artifact check plus default engine lane, 169/169 files passed, including `perf-baseline-trajectory-identity.test.js` and `zobrist-frame-digest-cache-equivalence.test.js`.
- `pnpm turbo lint typecheck` — passed; Turbo cache replay across 5/5 tasks, acceptable as supplemental proof for this report-only ticket.
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2508 archived tickets.
- `git diff --check -- tickets/194ZOBDECSTA-001.md reports/audits/zobrist-encoded-surface-field-irrelevance-2026-05-25.md .codex/run-state/implement-spec-tickets.json` — passed.
