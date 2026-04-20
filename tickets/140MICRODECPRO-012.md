# 140MICRODECPRO-012: D8 — Certificate machinery retirement + Spec 139 symbol deletion (F14 atomic)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — deletes certificate machinery across the kernel
**Deps**: `tickets/140MICRODECPRO-008.md`, `tickets/140MICRODECPRO-010.md`

## Problem

With profiles migrated (ticket 008), worker bridge rewritten (ticket 010), and the simulator + agent already free of `applyMove` / `chooseMove` (tickets 006/007), this ticket performs the final F14 atomic retirement: the entire certificate machinery and Spec 139 symbol footprint.

Files deleted: `completion-certificate.ts`, `decision-sequence-satisfiability.ts`, `move-decision-sequence.ts`, `move-decision-completion.ts`, `move-admissibility.ts`, `playable-candidate.ts`, plus the template-completion pipeline that remains in `move-completion.ts` (its stochastic-resolve logic was hoisted to `microturn/apply.ts` in ticket 005; this ticket deletes what remains).

T0 migration/deletion of Spec 139 test artifacts lands in this same commit.

## Assumption Reassessment (2026-04-20)

1. All 11 D8 retirement-target files exist (confirmed by Explore agent during reassessment) with total ~2,453 source lines:
   - `completion-certificate.ts` (189 lines, 7 src + 0 test consumers)
   - `decision-sequence-satisfiability.ts` (612 lines, 9 src + 4 test consumers)
   - `move-decision-sequence.ts` (287 lines, 15 src + 0 test consumers)
   - `move-decision-completion.ts` (65 lines, 5 src + 0 test consumers)
   - `move-completion.ts` (389 lines, 7 src + 9 test consumers — stochastic-resolve already hoisted in ticket 005)
   - `move-admissibility.ts` (120 lines, 5 src + 0 test consumers)
   - `playable-candidate.ts` (168 lines, 7 src + 0 test consumers)
   - Agent-side files (`prepare-playable-moves.ts`, `completion-guidance-choice.ts`, `completion-guidance-eval.ts`, `select-candidates.ts`) were already deleted in ticket 007
2. `hasAnyReachableCompletion(def, state, actionId) → boolean` is a **new** public function added when `choose-n-set-variable-propagation.ts` is retained per the reassessed D8 — it does not currently exist.
3. `LegalMoveEnumerationResult` and its `certificateIndex` field were already deleted as part of ticket 006's simulator rewrite (or persist here if ticket 006 left them pending).
4. Spec 139 test artifacts list at T0 — all 10 files confirmed to exist in their current locations.

## Architecture Check

1. F14 atomic: the full certificate deletion lands in one commit. No alias, no deprecation wrapper.
2. Mechanical uniformity per Foundation 14 exception: 11 files of coherent machinery retire together — this is structurally one change ("delete certificate machinery"), even though it spans many files.
3. Engine-agnostic (F1): zero game-specific code. The deletion narrows kernel surface without introducing any per-game branches.
4. Constructibility (F18, amended D10.3): with this ticket complete, every published legal action is atomically constructible; no surviving admission contract distinct from publication.

## What to Change

### 1. Delete Spec 139 kernel files

```
rm packages/engine/src/kernel/completion-certificate.ts
rm packages/engine/src/kernel/decision-sequence-satisfiability.ts
rm packages/engine/src/kernel/move-decision-sequence.ts
rm packages/engine/src/kernel/move-decision-completion.ts
rm packages/engine/src/kernel/move-admissibility.ts
rm packages/engine/src/kernel/playable-candidate.ts
```

Remove all imports, barrel exports, and re-exports referencing these modules from `packages/engine/src/kernel/index.ts` and any consumer files.

### 2. Delete template-completion pipeline from `move-completion.ts`

After ticket 005 hoisted stochastic-resolve to `microturn/apply.ts`, the remainder of `move-completion.ts` is template-completion-only — delete the file entirely:

```
rm packages/engine/src/kernel/move-completion.ts
```

### 3. Retain `choose-n-set-variable-propagation.ts` with narrow surface

Per spec 140 D8's "Retained (internal utility)" clause:

- Keep `packages/engine/src/kernel/choose-n-set-variable-propagation.ts`.
- Delete or make internal: `propagateChooseNSetVariable`, `ChooseNPropagationResult`, `ChooseNSetVariablePropagationContext` (today's public exports).
- Add new public function `hasAnyReachableCompletion(def: GameDef, state: GameState, actionId: ActionId): boolean` — estimates whether an action has any legal completion pathway without fully publishing every downstream microturn. Used for action-availability preview at the action-selection microturn.
- Narrow the module's public API to only `hasAnyReachableCompletion`.

### 4. Retain `choose-n-option-resolution.ts` and `move-identity.ts`

Spec 140 D8 indicates both may remain as internal helpers. Audit their current exports and narrow to the minimal surface needed by `choose-n-set-variable-propagation.ts` and the microturn pipeline. Delete any unused exports.

### 5. T0 migration — delete or migrate Spec 139 test artifacts

Per spec 140 T0 table, in the same commit:

Delete:
- `packages/engine/test/unit/kernel/completion-certificate.test.ts`
- `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts`
- `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts`
- `packages/engine/test/performance/spec-139-certificate-overhead.test.ts`

Migrate (per spec T0 class-marker sub-step): record current `@test-class` marker for each; if `convergence-witness`, use a fresh witness ID tied to spec 140 (e.g., `spec-140-microturn-native-decision-protocol`), or promote to `architectural-invariant` per Spec 137 distillation:
- `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` — narrow to the retained `hasAnyReachableCompletion` API, or delete if module is fully internal.
- `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` — update invariant to the microturn protocol (no-throw on non-empty `microturn.legalActions`).
- `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` — preserve assertion shape (bounded termination, no throw).
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` — regenerate golden fixtures under spec-140 protocol; byte-identical assertion preserved.
- `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` — strengthen to per-microturn projection.
- `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` — restate F18 conformance to the amended clause.

### 6. Remove remaining consumer references

Grep engine source for `CompletionCertificate`, `materializeCompletionCertificate`, `emitCompletionCertificate`, `certificateIndex`, `TemplateMove`, `applyTemplateMove`. Zero source hits after this ticket (T10 asserts this).

## Files to Touch

- `packages/engine/src/kernel/completion-certificate.ts` (delete)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (delete)
- `packages/engine/src/kernel/move-decision-sequence.ts` (delete)
- `packages/engine/src/kernel/move-decision-completion.ts` (delete)
- `packages/engine/src/kernel/move-admissibility.ts` (delete)
- `packages/engine/src/kernel/playable-candidate.ts` (delete)
- `packages/engine/src/kernel/move-completion.ts` (delete)
- `packages/engine/src/kernel/choose-n-set-variable-propagation.ts` (modify — narrow to `hasAnyReachableCompletion` only)
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify — narrow exports)
- `packages/engine/src/kernel/move-identity.ts` (modify — narrow exports to needed surface)
- `packages/engine/src/kernel/index.ts` (modify — remove stale re-exports)
- `packages/engine/test/unit/kernel/completion-certificate.test.ts` (delete)
- `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts` (delete)
- `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts` (delete)
- `packages/engine/test/performance/spec-139-certificate-overhead.test.ts` (delete)
- `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` (migrate or delete)
- `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` (migrate)
- `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` (migrate)
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (migrate — regenerate fixtures)
- `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` (migrate)
- `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` (migrate)

## Out of Scope

- FOUNDATIONS amendments (F5, F10, F18 text changes + F19 addition) — ticket 013.
- Doc updates — ticket 013.
- Brand-new tests T1-T15 — ticket 014.
- Agent-side deletions (`prepare-playable-moves.ts` etc.) — already done in ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — zero references to deleted symbols, module resolution green.
2. `grep -rn "CompletionCertificate\|materializeCompletionCertificate\|emitCompletionCertificate\|certificateIndex\|TemplateMove" packages/engine/src/` — zero hits.
3. `grep -rn "completion-certificate\|decision-sequence-satisfiability\|move-decision-sequence\|move-decision-completion\|move-admissibility\|playable-candidate\|move-completion" packages/engine/src/` — zero hits (except possibly narrow historical comments in migration commits).
4. Migrated Spec 139 tests pass under the new microturn protocol.
5. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. F14 atomic retirement: zero references to the deleted symbols or files.
2. F18 (amended) conformance: every published legal action is directly executable; admission contract retired.
3. `choose-n-set-variable-propagation.ts` exports only `hasAnyReachableCompletion` (if retained).

## Test Plan

### New/Modified Tests

- Deletions and migrations above. No brand-new tests here — T1–T15 are ticket 014.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Grep invariants above — zero hits.
3. `pnpm -F @ludoforge/engine test --force`
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
