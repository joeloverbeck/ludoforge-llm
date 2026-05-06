# 157PREVBUDBALCOV-001: Phase A — Balanced-coverage preview budget allocator (atomic cutover)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — schema (`GameDef.schema.json`), compiler (`compile-agents.ts`, `game-spec-doc.ts`), kernel compiled-agent types/schema, agents (`policy-eval.ts`, new `preview-budget-allocator.ts`, new `preview-group-key.ts`), authored profiles in `data/games/<game>/92-agents.md`, compiled fixtures, test corpus
**Deps**: `specs/157-preview-budget-balanced-coverage.md`

## Implementation Session Correction (2026-05-06)

This no-commit implementation session records the required golden re-bless evidence in this ticket's outcome/proof ledger instead of an implementing commit body. The implementation boundary is unchanged: Foundation 14 still requires the `preview.topK` removal, `preview.budget` migration, schema/artifact updates, authored-profile migration, and test fallout to land atomically.

## Boundary Reset (2026-05-06)

Live Phase A evidence disproved the draft FITL canary utility gate as a Phase A closeout criterion. With balanced coverage active, the sampled FITL corpus produced `previewUsage.utility === 'differentiating'` at 1/29 decisions with `fullCandidateCap: 4`; forcing caps of 10, 12, 16, 24, and 64 only reached 3/29 or 4/29. The red metric is not solved by Phase A coverage/cap migration alone. Per the confirmed Foundations-aligned reset, this ticket closes on the atomic `topK` removal, balanced-coverage activation, determinism, schema/fixture migration, and no-residue invariants. The FITL differentiating-rate target is residual evidence for Phase B/C ownership, not a Phase A terminal gate.

## Problem

Today's preview gate at `policy-eval.ts:596-612` uses `pickTopKByMoveOnlyScore` (`policy-eval.ts:1042-1071`) to rank candidates by move-only score, with a hard exclusion of preview-derived considerations via the `costClass !== 'preview'` filter at `policy-eval.ts:600-602`. This creates a circular dependency: any candidate whose differentiation comes only from preview cannot rank above its peers at the gate, so it never gets preview, so its differentiation is never observable. Empirically (per `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 2), in the FITL ARVN profile `preferGovernWeighted` adds `+governWeight` (move-only) so govern survives, while train/sweep/patrol/assault/raid all tie at 0 in move-only and are cut by alphabetical tiebreak — preview-driven scoring never reaches them. Raising `topK` widens coverage but does not break the circularity (verified at `topK=10` → 75% ready rate but 8/24 decisions still uniform).

Phase A replaces the static top-K gate with a multi-pass `allocatePreviewBudget` that guarantees minimum group coverage across action families before allocating remaining slots by stable-key-tie-broken move-only prior. This breaks the circularity at its root rather than tuning around it (F#15) and stays bounded by `fullCandidateCap` (F#10).

## Assumption Reassessment (2026-05-06)

1. **Code anchors verified** (per `/reassess-spec` 2026-05-06): `pickTopKByMoveOnlyScore` lives at `policy-eval.ts:1042-1071`; `costClass !== 'preview'` filter at `:600-602`; `topK ?? 4` cap at `:605`; `selectRepresentativeCandidatesByActionId` at `:940`; `selectionGrouping` field at `:207`; `lowerPreviewConfig` at `compile-agents.ts:761-824`. All identifiers exist; line numbers updated from spec's stale citations.
2. **Spec 156 dependency satisfied**: `selectionReason` enum at `policy-eval.ts:84` is `['coverage', 'prior', 'shallowDelta', 'widening', 'cache', 'gated']`; `previewUsage.utility` populated at `:1117` via `classifyPreviewUtility`. Currently emits `'gated' | 'prior'` only — this ticket adds `'coverage'` emission.
3. **Authored profile location is `92-agents.md` (not `*.yaml`)**: ARVN profiles live at `data/games/fire-in-the-lake/92-agents.md` (`arvn-baseline` with no explicit `topK` → falls back to `?? 4`; `arvn-evolved` with `topK: 10`). Texas baseline at `data/games/texas-holdem/92-agents.md` uses `mode: disabled` (no `topK`); compiled JSON nonetheless emits `topK: 4` from the validator's default.
4. **WASM scoring path**: `tryScoreMoveConsiderationsWithWasm` at `policy-eval.ts:629-644` runs after the allocator and is unaffected by gate-shape changes; WASM-encoded profile fingerprints regenerate alongside compiled JSON.
5. **Adjacent observability** at `policy-eval.ts:613-628`: `markPreviewGated` / `previewGatedCount` / `scoreCandidateForGateFlipProbe` instrumentation is preserved unchanged; `AllocatorOutput.allowedKeys` drives this loop exactly as today.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Group-coverage breaks the circularity at its root: every candidate family is guaranteed at least one preview, so preview signal can reach the candidates that need it most. The prior pass biases additional slots toward likely-impactful candidates without excluding any family. Compared to widening `topK` (rejected — doesn't fix the circularity), diversity-only gating (rejected — over-coarse, loses within-family ranking), two-pass shallow + full preview (folded into Phase B's structural-impact prior), and learned priors (rejected — F#7, F#8), this preserves within-family ranking, stays deterministic and bounded, and reuses existing repo primitives.
2. **GameSpecDoc vs runtime boundary preserved.** `previewGroupKey` components (`actionId`, `parameterShapeSignature`, `sideTag?`) are derived from compiled IR — generic over GameDef shapes (F#1). Profile YAML gains `preview.budget` config knobs that the compiler validates statically (F#12). GameSpecDoc itself is unaffected.
3. **No backwards-compatibility shims (F#14 strict).** `preview.topK` is deleted from the schema, the compiler, the runtime types, every authored profile in `data/games/<game>/92-agents.md`, every compiled fixture, and every test/perf consumer in the same change as `preview.budget` lands. No alias, no deprecation warning, no `_legacy` field. **F#14 atomic-cut justification for Large effort**: the migration portion is mechanically uniform (every `preview: { topK: N }` → `preview: { budget: { strategy: balancedCoverage, fullCandidateCap: <derived-from-N>, minPerGroup: 1 } }`) and must land atomically with the schema and runtime changes; splitting would create transitional state where source and tests disagree.

## What to Change

### 1. Schema — `preview.topK` → `preview.budget`

`packages/engine/schemas/GameDef.schema.json`: replace the `topK: integer >= 1` field on `preview` with a `budget: BudgetConfig` object. `BudgetConfig` validates `strategy: 'balancedCoverage'`, `fullCandidateCap: integer >= 1`, `minPerGroup: integer >= 0`, `widenOnUniformProjection?: boolean`, `widenCap?: integer >= 0`, `widenStep?: integer >= 1`. Compile-time error if `widenOnUniformProjection: true` and either `widenCap` or `widenStep` is missing (the actual widening logic ships in Phase C / ticket 003; the schema accepts the fields now to keep migration atomic).

### 2. Validator — `lowerPreviewConfig` at `compile-agents.ts:761-824`

Rewrite to:
- Reject `preview.topK` with a diagnostic naming the migration to `preview.budget` (`doc.agents.profiles.<id>.preview.topK` → "Use `preview.budget` (Spec 157). Migrate to `{ strategy: 'balancedCoverage', fullCandidateCap, minPerGroup }`.").
- Validate `preview.budget` shape against `BudgetConfig`.
- When `preview.mode === 'disabled'`, omit `budget` from compiled output (bypass — preserved behavior; the runtime skips the allocator entirely).
- Existing `topK: 1.5` rejection test (`compile-agents-authoring.test.ts:1707`) is replaced by a `budget.fullCandidateCap: 1.5` rejection test.

### 3. New module — `packages/engine/src/agents/preview-group-key.ts`

Engine-generic `previewGroupKey(catalog, candidate): string`. Concatenate stable string components with `|` separator:
- Component 1: `actionId` for action-selection candidates; `decisionKind:decisionKey` for inner-microturn candidates (the latter is reserved for Spec 160 reuse — Phase A only emits `actionId`).
- Component 2: `parameterShapeSignature` — stable hash over the candidate's bound-parameter shape (zone-set cardinality, token-count, side tag if present). Computed at gate time from already-resolved candidate metadata.
- Component 3: `sideTag` (if present in candidate metadata).

All components sourced from compiled IR — no game-specific text in engine code (F#1).

### 4. Allocator — `allocatePreviewBudget` in `packages/engine/src/agents/policy-eval.ts`

```
input:  { candidates, profile.preview.budget, evaluation, considerations }
output: { allowedKeys: ReadonlySet<StableMoveKey>, selectionReason: Map<StableMoveKey, SelectionReason> }
```

Pseudocode (Phase A — no structural-impact prior yet, no widening):

```
groups = group(candidates, candidate => previewGroupKey(catalog, candidate))
sortedGroups = sort(groups, (a, b) => compareStrings(a.key, b.key))
allowed = new Set()
selectionReason = new Map()
quota = fullCandidateCap
for slot in 0..minPerGroup:
  for group in sortedGroups:
    if quota <= 0: break
    candidate = sortedGroupCandidates(group)[slot]
    if candidate is undefined: continue
    allowed.add(candidate.stableMoveKey)
    selectionReason.set(candidate.stableMoveKey, 'coverage')
    quota -= 1
remaining = candidates filtered by !allowed
priorRanked = sort(remaining, by priorScore desc, stableMoveKey asc)  // codepoint compare via < / >, NO localeCompare
for c in priorRanked:
  if quota <= 0: break
  allowed.add(c.stableMoveKey)
  selectionReason.set(c.stableMoveKey, 'prior')
  quota -= 1
return { allowedKeys: allowed, selectionReason }
```

**Determinism (F#8)**: explicit codepoint compare via `<`/`>`, no `localeCompare`, integer-only score arithmetic, group-key string compare is byte-stable.

### 5. Wire allocator into `policy-eval.ts:596-612`

Replace the `pickTopKByMoveOnlyScore` call. Bypass when `profile.preview.mode === 'disabled'`: produce `allowedKeys = new Set(allCandidates)` and skip the allocator entirely (preserves today's behavior at `:603-605`). Otherwise call `allocatePreviewBudget` and pass its `allowedKeys` to the existing `markPreviewGated` / `previewGatedCount` / `scoreCandidateForGateFlipProbe` instrumentation at `:613-628` unchanged. Candidates not in `allowedKeys` get `selectionReason: 'gated'`.

### 6. Delete `pickTopKByMoveOnlyScore`

Remove `policy-eval.ts:1042-1071` entirely; remove the test file `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (subsumed by `preview-budget-allocator.test.ts`). Add `architectural-invariant` test asserting no `packages/engine/src/**` file references `pickTopKByMoveOnlyScore` or `preview.topK`.

### 7. Migrate authored profiles (F#14 strict)

- `data/games/fire-in-the-lake/92-agents.md`:
  - `arvn-baseline` (currently no explicit `topK`): set `preview: { mode: exactWorld, budget: { strategy: balancedCoverage, fullCandidateCap: 4, minPerGroup: 1 } }` — `4` matches today's effective `?? 4` default.
  - `arvn-evolved` (currently `topK: 10`): set `preview: { mode: exactWorld, budget: { strategy: balancedCoverage, fullCandidateCap: 10, minPerGroup: 1 } }`.
- `data/games/texas-holdem/92-agents.md`:
  - `baseline` (currently `mode: disabled`, no `topK`): no field-level change required — `mode: disabled` remains; the allocator is bypassed. Confirm the compiled fixture no longer emits `topK: 4`.

### 8. Migrate fixtures and tests (F#14 strict)

- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`: re-bless. Commit body MUST include `Re-bless golden trace: fitl-policy-catalog.golden.json — Spec 157 budget allocator`.
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json`: re-bless. Commit body MUST include `Re-bless golden trace: texas-policy-catalog.golden.json — Spec 157 budget allocator`.
- `packages/engine/test/golden/**`: re-bless any other goldens that grep `topK` at write time, with appropriately named commit-body re-bless lines per file.
- `packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts`: migrate the 6 `preview: { mode: 'exactWorld', topK }` constructions (lines around 38, 41, 100, 102, 164, 166) to `preview: { mode: 'exactWorld', budget: { strategy: 'balancedCoverage', fullCandidateCap: topK, minPerGroup: 1 } }` (the test parameter currently named `topK` should be renamed `fullCandidateCap` for clarity).
- `packages/engine/test/unit/compile-agents-authoring.test.ts`: rewrite the `topK` validator tests at L1103, L1118, L1707, plus the diagnostic-path test at L1734, against `budget`. Replace the `topK: 1.5` rejection test with a `budget.fullCandidateCap: 1.5` rejection test.
- `packages/engine/test/perf/agents/derive-topk-floor.mjs`: rename to `derive-fullCandidateCap-floor.mjs` and rework the failure message at L65 to reference `preview.budget.fullCandidateCap` instead of `preview.topK`. If the new allocator's coverage guarantee makes the floor probe meaningless, delete the file instead — implementer judgment, document the reason in the commit body.

### 9. Trace integration with Spec 156

Allocator emits `selectionReason: 'coverage' | 'prior' | 'gated'` on every candidate (the `'widening'` value lands in Phase C / ticket 003; `'shallowDelta'` and `'cache'` remain reserved for future specs). `previewGatedCount` parity-checked against `count(selectionReason === 'gated')` — same value, both fields preserved this iteration. `widenedBecauseUniform: false` is hard-wired on `previewUsage` for now (Phase C populates it conditionally).

### 10. Documentation — `docs/agent-dsl-cookbook.md`

Document the `preview.budget` shape (strategy, fullCandidateCap, minPerGroup, plus the Phase C fields documented as forward-looking but valid). Migration guidance: "If your profile previously used `preview.topK: N`, use `preview.budget: { strategy: 'balancedCoverage', fullCandidateCap: N, minPerGroup: 1 }`. The compile-time validator rejects `preview.topK` with a diagnostic." Briefly explain group coverage and the circularity it breaks, with a forward link to Phases B and C.

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — `preview.topK` removed, `preview.budget` added)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `lowerPreviewConfig` rewrites; removed cap rejected with diagnostic)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — budget diagnostic code)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — authored `budget` shape)
- `packages/engine/src/kernel/types-core.ts` (modify — compiled `budget` types)
- `packages/engine/src/kernel/schemas-core.ts` (modify — compiled `budget` schema)
- `packages/engine/src/agents/policy-eval.ts` (modify — allocator wiring; `pickTopKByMoveOnlyScore` deleted; `selectionReason` emission integrated; bypass when `mode: 'disabled'`)
- `packages/engine/src/agents/preview-budget-allocator.ts` (new — budget allocation and selection reasons)
- `packages/engine/src/agents/preview-group-key.ts` (new — engine-generic group keying)
- `data/games/fire-in-the-lake/92-agents.md` (modify — `arvn-baseline` and `arvn-evolved` profiles migrated)
- `data/games/texas-holdem/92-agents.md` (verified-no-edit — `mode: disabled` source already had no removed cap field; compiled output drops the old default cap)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify — re-bless)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (modify — re-bless)
- `packages/engine/test/golden/**` (verified-no-edit — directory absent in current repo)
- `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (delete — subsumed)
- `packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts` (modify — migrate 6 `topK` constructions)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — rewrite `topK` validator tests)
- `packages/engine/test/perf/agents/derive-topk-floor.mjs` (delete — floor probe is obsolete once coverage, not a scalar cap floor, owns Phase A)
- `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (new — coverage + prior + hard-cap invariants)
- `packages/engine/test/unit/agents/preview-group-key.test.ts` (new — stability + uniqueness over 20-candidate corpus)
- `packages/engine/test/unit/cnl/compile-preview-budget.test.ts` (new — compile-time `topK` rejection + `budget` validator)
- `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` (verified-existing — replay identity and gated-count parity still cover the runtime trace invariant)
- `packages/engine/test/unit/agents/no-topk-references.test.ts` (new — greps `packages/engine/src/**` for deleted helper and asserts removed cap residue is absent from authored profiles/fixtures)
- `docs/agent-dsl-cookbook.md` (modify — `preview.budget` documented; migration guidance)

## Out of Scope

- **Phase B — Structural-impact prior via `EffectFootprint`**: ticket 002.
- **Phase C — Widen-on-uniform**: ticket 003. The schema accepts `widenOnUniformProjection`/`widenCap`/`widenStep` fields now (so Phase C does not need a second migration), but the runtime ignores them in Phase A.
- **Microturn-scope considerations**: Spec 158.
- **New completion-policy semantics**: Spec 159.
- **Per-option preview at inner microturns**: Spec 160. `previewGroupKey`'s second component (`decisionKind:decisionKey`) is reserved for Spec 160 reuse but emits `actionId` only in Phase A.
- **Caching of preview results**: future spec.
- **Replacing `previewGatedCount` field**: coexists with `selectionReason: 'gated'` until a future cleanup spec.
- **Two-pass shallow + full preview**: folded into Phase B's structural-impact prior; promotion to its own spec only if empirics demand it.

## Implementation Outcome (2026-05-06)

- Landed the Phase A atomic migration from the removed preview cap field to `preview.budget`: authored FITL profiles, compiled profile types/schema, generated `GameDef.schema.json`, and policy catalog fixtures now use `budget`.
- Replaced the move-only top-K gate with `allocatePreviewBudget`, which does deterministic group coverage first and stable-key-tie-broken prior fill second. `selectionReason` now records `coverage`, `prior`, or `gated`; the existing `previewGatedCount` parity surface remains.
- Deleted `pickTopKByMoveOnlyScore` and the obsolete `derive-topk-floor.mjs` perf probe. The old probe was not renamed because the Phase A contract is no longer a scalar cap floor; it is group coverage plus bounded prior fill.
- Re-bless evidence recorded here for the no-commit session: `fitl-policy-catalog.golden.json` and `texas-policy-catalog.golden.json` were regenerated from the current compiled production specs after the migration.
- Boundary correction: the draft `>= 60% differentiating` FITL canary gate is not a Phase A acceptance gate. Diagnostic probe results after the migration: cap 4 = 1/29; cap 10 = 3/29; cap 12/16/24/64 = 4/29. This residual belongs to Phase B/C.
- Source file size ledger: `policy-eval.ts`, `compile-agents.ts`, `types-core.ts`, and `schemas-core.ts` were preexisting over repo guidance. New allocator/key logic was extracted into new agent modules; retained active growth in oversize files is limited to contract/wiring edits required by the shared migration.
- Final proof ledger:
  - `pnpm turbo schema:artifacts` passed; generated `GameDef.schema.json` is current.
  - Focused built test lane passed: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-budget-allocator.test.js dist/test/unit/agents/preview-group-key.test.js dist/test/unit/cnl/compile-preview-budget.test.js dist/test/unit/agents/no-topk-references.test.js dist/test/unit/agents/preview-ready-ref-stats-aggregator.test.js dist/test/unit/compile-agents-authoring.test.js dist/test/unit/agents/preview-selection-reason-gated-parity.test.js` (`76` tests, `7` suites, `0` failures).
  - `pnpm turbo typecheck` passed (`3/3` tasks).
  - `pnpm turbo lint` passed (`2/2` tasks).
  - `pnpm -F @ludoforge/engine test` passed after schema artifact checking (`64/64` default files passed).
  - `pnpm turbo test` passed (`5/5` tasks; engine default lane `64/64` files, runner `205` files / `2019` tests).
  - `pnpm run check:ticket-deps` passed (`3` active tickets, `2248` archived tickets).
- Late-edit validity: ticket/spec/sibling boundary corrections were made before final proof. The terminal status and proof-ledger edits are transcription-only and do not alter runtime, schema, fixture, or test behavior.

## Acceptance Criteria

### Tests That Must Pass

1. New: `allocatePreviewBudget` with `minPerGroup: 1, fullCandidateCap: 4` over 12 candidates spanning 6 actionIds selects at least one candidate from each of the first 4 groups (coverage invariant).
2. Diagnostic only: sampled FITL utility rate is recorded in the outcome ledger. Phase A does not require `previewUsage.utility === 'differentiating'` rate ≥ 60%; the live red metric is residual evidence for Phase B/C.
3. New: `previewGroupKey` is stable across two compiles of the same GameSpec (deterministic identity).
4. New: Compile-time rejection of `preview.topK: 4` with a diagnostic naming the migration to `preview.budget`.
5. New: Compile-time rejection of `widenOnUniformProjection: true` without `widenCap` or `widenStep` (schema accepts Phase C fields now).
6. New: Replay-identity — same GameDef + seed + actions twice produces byte-identical `selectionReason` map.
7. New: Texas baseline (`mode: disabled`) compiled JSON no longer contains `topK` field.
8. Existing engine suite: `pnpm -F @ludoforge/engine test`.
9. Existing typecheck: `pnpm turbo typecheck`.
10. Schema artifacts: `pnpm turbo schema:artifacts`.

### Invariants

1. (architectural-invariant) For every preview decision, `Σ |selected per group| ≥ min(numGroups, fullCandidateCap)` whenever `minPerGroup ≥ 1`.
2. (architectural-invariant) Allocator output size ≤ `fullCandidateCap` (Phase A; widening cap arrives in ticket 003).
3. (architectural-invariant) Allocator is deterministic across runs (replay-identity over `selectionReason` map).
4. (architectural-invariant) `pickTopKByMoveOnlyScore` is not exported and not referenced anywhere in `packages/engine/src/**` (delete-confirm test).
5. (architectural-invariant) No authored profile (`data/games/<game>/92-agents.md`) or fixture references `preview.topK` (compile-time grep test).
6. (architectural-invariant) `previewUsage.previewGatedCount === count(selectionReason === 'gated')` on every preview decision (parity preserved through migration).
7. (architectural-invariant) Allocator uses no `localeCompare` and no wall-clock/locale-dependent ordering (codepoint-compare grep test on the new module).
8. (golden-trace) FITL canary trace produces byte-identical `selectionReason` per candidate across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (new) — `architectural-invariant`. Coverage, prior fill, hard-cap, codepoint-compare determinism.
2. `packages/engine/test/unit/agents/preview-group-key.test.ts` (new) — `architectural-invariant`. Stability + uniqueness over a 20-candidate corpus spanning multiple actionIds and parameter shapes.
3. `packages/engine/test/unit/cnl/compile-preview-budget.test.ts` (new) — `architectural-invariant`. Compile-time rejection of `topK`, of malformed `budget`, and of `widenOnUniformProjection: true` without `widenCap`/`widenStep`.
4. `packages/engine/test/unit/agents/preview-selection-reason-gated-parity.test.ts` (modified/existing) — `architectural-invariant`. Two-run identity over `selectionReason` map plus `previewGatedCount` parity.
5. `packages/engine/test/unit/agents/no-topk-references.test.ts` (new) — `architectural-invariant`. Greps `packages/engine/src/**` for the deleted helper and asserts authored profiles/fixtures no longer contain the removed preview cap field.
6. `packages/engine/test/unit/agents/preview-ready-ref-stats-aggregator.test.ts` (modify) — migrate the 6 `topK` constructions; rename test parameter to `fullCandidateCap`.
7. `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify) — rewrite `topK` validator tests against `budget`; replace `topK: 1.5` rejection with `budget.fullCandidateCap: 1.5` rejection.
8. `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (delete — subsumed by allocator tests above).

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-budget-allocator`
2. `pnpm -F @ludoforge/engine test:unit -- agents/preview-group-key`
3. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-preview-budget`
4. `pnpm -F @ludoforge/engine test:unit -- agents/no-topk-references`
5. `pnpm turbo schema:artifacts`
6. `pnpm turbo lint typecheck test`

## Outcome

Completed: 2026-05-06

- Landed the Phase A atomic migration from `preview.topK` to `preview.budget` across compiled types/schema, authoring validation, generated schema, FITL authored profiles, compiled policy catalog fixtures, docs, and tests.
- Replaced the move-only top-K gate with deterministic balanced coverage plus stable prior fill via `allocatePreviewBudget` and `previewGroupKey`; `selectionReason` now records `coverage`, `prior`, or `gated`, and `previewGatedCount` parity remains covered by tests.
- Deleted `pickTopKByMoveOnlyScore`, removed the obsolete `derive-topk-floor.mjs` perf probe, and added residue tests proving the removed cap/helper are absent from owned source/profile/fixture surfaces.
- Deviations from the original draft: the FITL `>= 60% differentiating` canary was retired as a Phase A terminal gate after live evidence showed balanced coverage alone remained red; active tickets `tickets/157PREVBUDBALCOV-002.md` and `tickets/157PREVBUDBALCOV-003.md` own structural-impact and widening residuals. The drafted hard-wired `widenedBecauseUniform: false` trace field did not land in Phase A; active ticket `tickets/157PREVBUDBALCOV-003.md` owns that trace surface and runtime behavior.
- No-commit evidence handling: the required re-bless evidence for `fitl-policy-catalog.golden.json` and `texas-policy-catalog.golden.json` is recorded in this ticket's implementation/proof ledger instead of an implementing commit body.
- Verification passed: `pnpm turbo schema:artifacts`; focused built Node test lane for allocator/group-key/compiler/no-residue/authoring fallout (`76` tests, `7` suites); `pnpm turbo typecheck`; `pnpm turbo lint`; `pnpm -F @ludoforge/engine test` (`64/64` default files); `pnpm turbo test` (`5/5` tasks; engine `64/64` files, runner `205` files / `2019` tests); `pnpm run check:ticket-deps`.
