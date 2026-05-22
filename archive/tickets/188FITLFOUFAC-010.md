# 188FITLFOUFAC-010: VC skeleton + headline witnesses (port of 008)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-008.md`, `archive/tickets/188FITLFOUFAC-009.md`, `archive/tickets/188FITLFOUFAC-010A.md`

## Problem

Spec 188 §4.2 / Phase 2 authors the VC faction personality as a correct skeleton: doctrine set + signature plan templates (Rally+Subvert, March+Subvert, Terror+Subvert, Terror+Tax, March+Ambush-from-LoC, Rally-reset→Terror) + key role selectors + top errors-to-avoid guardrails + relationship wiring (NVA/VC rival-ally per report §5.2). This is a **port** of the US skeleton ticket (008), listing only VC-specific content.

## Assumption Reassessment (2026-05-21)

1. `vc-baseline` is the current VC profile binding (`92-agents.md` ~line 778); this ticket authors the VC skeleton and rebinds the VC seat.
2. The skeleton-authoring structure is established by ticket 008 — follow it verbatim, substituting VC content.
3. The NVA/VC relationship (report §5.2) is the counterpart of NVA's wiring completed in `archive/tickets/188FITLFOUFAC-009.md` — keep the two sides consistent.

## Live Reassessment (2026-05-22)

1. A live `010` implementation probe authored the VC YAML skeleton and the two ticket-named warning-class witnesses. `pnpm -F @ludoforge/engine build` and the focused compiled VC witnesses passed.
2. The broad acceptance lane then exposed a generic architecture blocker: `pnpm -F @ludoforge/engine test:all` stalled after `dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`; isolated `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` timed out after 120 seconds with only `TAP version 13`.
3. Per `docs/FOUNDATIONS.md`, this ticket cannot close by weakening its broad-suite proof, under-authoring the VC signature skeleton, or adding FITL-specific runtime code. The approved reset inserted `archive/tickets/188FITLFOUFAC-010A.md` as a generic prerequisite before VC skeleton authoring resumes.
4. The abandoned VC YAML/test probe was removed before the retarget handoff; this ticket remains `PENDING` and owns no landed partial implementation yet.

## Live Reassessment (2026-05-22, after 010A)

1. After `archive/tickets/188FITLFOUFAC-010A.md`, the VC skeleton and focused witnesses can be authored and compiled again. `pnpm -F @ludoforge/engine build` and the focused compiled VC witnesses passed.
2. The required broad engine lane no longer stalls, but the intentional VC profile trajectory shift invalidated two generic proof artifacts: the Spec 178 outcome-parity fixtures and the Spec 144 policy-guided FITL canary fixture/anchor.
3. User-approved Foundations-aligned reset: re-anchor only the generic generated proof artifacts needed to preserve the same architecture invariants. Do not weaken `pnpm -F @ludoforge/engine test:all`, do not remove the canary invariant, and do not add FITL-specific runtime code. If the canary invariant itself no longer holds, retarget to a new prerequisite instead of closing this ticket.
4. The five Spec 178 outcome-parity fixtures may be refreshed as generated fallout of the intentional production GameSpec/profile trajectory shift, following the precedent from archived tickets 008/009 and preserving the same first-turn parity invariant.
5. The same approved reset also covers the Spec 158 migration witness after the retained Spec 144 fixture refresh: the fixed seed still exercises Patronage Govern decisions, but now captures three Govern-mode choices rather than the stale four-count assertion.

## Architecture Check

1. Port pattern — references ticket 008's structure; only VC-specific content differs.
2. Pure YAML, generic constructs (Foundation #1, #2).
3. No backwards-compatibility shims.

## What to Change

### 1. VC skeleton (follow ticket 008's shape)

Author VC doctrine carriers (priority stack report ~line 923; final statement ~line 1119), signature templates (combos ~lines 971-1053), key selectors (target features ~line 1055), top guardrails (errors ~line 1107), and the VC side of the NVA/VC relationship (report §5.2, ~line 1172). Rebind the VC seat.

### 2. Headline witnesses

Add Phase-2 VC headline witnesses: VC avoids conventional Attack unless Ambush payoff; VC protects bases from NVA Infiltrate.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.ts` (new)
- `packages/engine/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.ts` (new)
- `packages/engine/test/policy-profile-quality/vc-plan-witness-helpers.ts` (new owned DRY helper for the two VC witnesses)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-*.json` (refresh only as generated fallout from intentional production-profile trajectory shift)
- `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` or `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/*` (modify only to preserve the same generic policy-guided preview canary invariant after the intentional trajectory shift)

(Witness paths follow the `policy-profile-quality/` convention; may be consolidated.)

## Out of Scope

- ARVN (003–007), US (008), NVA (009).
- Full VC fidelity beyond the skeleton.
- Generic parity-witness performance or boundedness work exposed by the live VC skeleton probe; that is owned by `archive/tickets/188FITLFOUFAC-010A.md`.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the VC skeleton bound to the VC seat (no diagnostics).
2. The two VC headline witnesses pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. VC headline witnesses are warning-class (live in `policy-profile-quality/`).

## Test Plan

### New/Modified Tests

1. `vc-avoids-conventional-attack-without-ambush.test.ts`, `vc-protects-bases-from-nva-infiltrate.test.ts` — Phase-2 VC headline witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js packages/engine/dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`
2. `pnpm turbo test`

## Outcome

Completed 2026-05-22.

Landed the Tier-1 VC skeleton in `data/games/fire-in-the-lake/92-agents.md`: VC selectors, Rally/Subvert, March/Subvert, Terror/Subvert, Terror/Tax, March/Ambush-from-LoC, Rally-reset-to-Terror templates, VC posture/strategy modules, NVA/VC ally-rival relationship wiring, and VC guardrails are now bound through `vc-baseline`. No engine/compiler production code was changed.

Added the two ticket-owned warning-class witnesses under `packages/engine/test/policy-profile-quality/` with a shared helper:

- `vc-avoids-conventional-attack-without-ambush.test.ts`
- `vc-protects-bases-from-nva-infiltrate.test.ts`
- `vc-plan-witness-helpers.ts`

Preserved generic proof anchors after the intentional production-profile trajectory shift:

- refreshed the five Spec 178 outcome-parity fixtures for seeds `1005`, `1011`, `1008`, `1013`, and `1009`;
- refreshed the retained Spec 144 probe-recovery fixture hash/decision sequence with its checked-in generator;
- re-anchored `policy-guided-fitl-canary.golden.test.ts` to the public ARVN Govern `chooseOne` microturn while preserving the `preferPatronageMode` differentiating policy-guided chooser invariant;
- updated `migration-equivalence-prefer-patronage.test.ts` to derive the expected Patronage choices from the retained fixture, preserving the same migration-equivalence invariant without a stale four-choice count.

Proof:

- `pnpm -F @ludoforge/engine build` passed.
- `node --test packages/engine/dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js packages/engine/dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js` passed: 2 tests, 2 suites.
- `node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js` passed from `packages/engine`: 5 tests.
- `node --test dist/test/unit/policy-guided-fitl-canary.golden.test.js` passed from `packages/engine`: 1 test.
- `node --test dist/test/unit/agents/migration-equivalence-prefer-patronage.test.js` passed from `packages/engine`: 2 tests.
- `pnpm -F @ludoforge/engine test:all` passed: 958 tests, 958 pass, 0 fail.

Command substitutions:

- Split the ticket's first command into a serial build plus focused compiled witness run so `dist` was current before Node's test runner consumed it.
- Replaced `pnpm turbo test` with `pnpm -F @ludoforge/engine test:all` because every owned code, fixture, and data change is under the engine package/FITL production data surface; no runner or non-engine package files changed.

Generated artifact provenance:

- Spec 178 fixtures were refreshed from the production FITL `GameSpecDoc` after VC skeleton binding, using the current `maxTurns` in each fixture, seeds `1005`, `1011`, `1008`, `1013`, and `1009`, and the `arvn-evolved` continued-deepening capture shape from `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`. The ad hoc generator command was:

```bash
node --input-type=module -e 'import { existsSync, readFileSync, writeFileSync } from "node:fs"; import { join } from "node:path"; import { PolicyAgent } from "./packages/engine/dist/src/agents/index.js"; import { assertValidatedGameDef, createGameDefRuntime } from "./packages/engine/dist/src/kernel/index.js"; import { runGame } from "./packages/engine/dist/src/sim/index.js"; import { compileProductionSpec } from "./packages/engine/dist/test/helpers/production-spec-helpers.js"; const repo=process.cwd(); const playerCount=4; const profileId="arvn-evolved"; const fixturePathForSeed=(seed)=>join(repo,"packages","engine","test","architecture","fixtures","178-outcome-parity-"+seed+".json"); const profileForSeat=(seatId)=>seatId.toLowerCase()==="arvn"?profileId:seatId.toLowerCase()+"-baseline"; const selectedValueFor=(decision)=>("value" in decision?decision.value:null); const collectCandidates=(agentDecision)=>(agentDecision.candidates ?? []).map((candidate)=>({stableMoveKey:candidate.stableMoveKey,score:candidate.score,scoreContributions:candidate.scoreContributions,unknownPreviewRefs:candidate.unknownPreviewRefs ?? [],previewFallbackFired:candidate.previewFallbackFired ?? null,selectionReason:candidate.selectionReason,previewOutcome:candidate.previewOutcome ?? null,previewDrive:candidate.previewDrive ?? null})); const normalize=(value)=>JSON.parse(JSON.stringify(value,(_key,nested)=>typeof nested==="bigint"?nested.toString():nested,2)+"\n"); const capture=(seed,maxTurns)=>{ const { compiled }=compileProductionSpec(); const def=assertValidatedGameDef(compiled.gameDef); const runtime=createGameDefRuntime(def); const agents=(def.seats ?? []).map((seat)=>new PolicyAgent({profileId:profileForSeat(String(seat.id)),traceLevel:"verbose"})); const trace=runGame(def,seed,agents,maxTurns,playerCount,{skipDeltas:true},runtime); const decisions=trace.decisions.filter((entry)=>entry.decisionContextKind==="chooseOne").filter((entry)=>entry.agentDecision?.resolvedProfileId===profileId).filter((entry)=>entry.agentDecision?.previewUsage.coverage.strategy==="continuedDeepening").map((entry)=>{ const agentDecision=entry.agentDecision; if(!agentDecision) throw new Error("continuedDeepening ARVN chooseOne decisions must include policy trace metadata"); return {turnCount:null,turnId:entry.turnId ?? null,decisionKey:String(entry.decisionKey),selectedValue:selectedValueFor(entry.decision),selectedStableMoveKey:agentDecision.selectedStableMoveKey ?? null,previewUsage:agentDecision.previewUsage,advisories:agentDecision.advisories ?? [],scoreContributionsByOption:collectCandidates(agentDecision)}; }); if(decisions.length===0) throw new Error("seed "+seed+" must exercise arvn-evolved continuedDeepening chooseOne decisions"); return normalize({seed,maxTurns,profileId,decisions}); }; for (const seed of [1005,1011,1008,1013,1009]) { const path=fixturePathForSeed(seed); if(!existsSync(path)) throw new Error("fixture does not exist: "+path); const current=JSON.parse(readFileSync(path,"utf8")); const refreshed=capture(seed,current.maxTurns); writeFileSync(path,JSON.stringify(refreshed,null,2)+"\n"); console.log("refreshed "+path+" decisions="+refreshed.decisions.length); }'
```

- Spec 144 canary fixture outputs were refreshed with `node packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs` against the production FITL `GameSpecDoc` after VC skeleton binding and canary re-anchor.

Source-size notes:

- New TypeScript files are 52, 70, and 60 lines.
- Modified canary and migration witness files are 142 and 162 lines.
- `data/games/fire-in-the-lake/92-agents.md` is authored production data and already above the general source-size guidance; this ticket's owned change is YAML authoring required by Spec 188.
