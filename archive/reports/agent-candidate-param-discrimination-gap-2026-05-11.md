# Agent Candidate-Parameter Discrimination Gap — Action-Selection Scope

**Date**: 2026-05-11
**Reported from**: fitl-arvn-agent-evolution improve-loop campaign (worktree `.claude/worktrees/improve-fitl-arvn-agent-evolution`, branch `improve/fitl-arvn-agent-evolution`)
**Status**: Open — handoff to ChatGPT-Pro for deep research alongside `docs/FOUNDATIONS.md`
**Severity**: High — blocks agent evolution for any game whose action-selection candidates carry meaningful per-candidate parameters (events with shaded/unshaded sides, pivotal events with card-id, possibly others)
**Prior related report**: `reports/fitl-coup-victory-checkpoint-bug-2026-05-11.md` (now resolved by commit `edb7a68f6`)

---

## 1. Executive summary

The agent DSL allows score-bearing considerations to discriminate candidates at action-selection scope only by **action class** (via `candidate.tag.<actionId>`), by **action identifier** / **stable move key** / **param count** (via candidate intrinsics), and by **preview-projected margin / derived metric** (via the `preview.*` ref families).

It **cannot** read the individual move parameters that distinguish two same-action candidates. For FITL's Card Event action, every candidate has `params.side ∈ {shaded, unshaded}` and an optional `params.branch`; for Pivotal Events, every candidate has `params.eventCardId`. These params materially determine whether the play *helps* or *hurts* the acting seat — and they are physically present in the published move shape — but they are unreachable from any score-bearing consideration in the current authoring surface.

Empirically, this gap is severe enough that the most recent improve-loop iteration (exp-006-pf, adding `preferEvent` with `eventWeight=500` to the ARVN profile) **regressed** the tier-15 composite score from `-3.8` to `-3.9333`: the additional event play that the boost induced was distributed 6/12 across the *anti-COIN* shaded side because the bounded preview at `depthCap=4` cannot resolve event-side effects to a margin signal that reliably ranks them. The COIN faction (ARVN) is literally helping the insurgents 50% of the times it plays events under this incentive.

A second, weaker form of the same problem shows up across operations. ARVN plays **0 patrol, 0 sweep, 0 assault, 0 raid, 0 advise, 0 pivotalEvent** across 15 seeds; it plays `govern` 118x, `train` 24x, `event` 10x, and `transport` 6x. Operations like patrol/sweep/assault have meaningful per-candidate state (target zone is decided in a subsequent chooseN microturn, but the action choice itself happens at the action-selection frame *before* the agent sees those targets). Encoding "prefer patrol when there are enemy units to activate" requires either a per-action-type heuristic boost (which the library has — `preferPatrolAction` etc.) or an authored signal that integrates game-state-conditional reasoning at action-selection scope. The former exists; the latter falls back on preview's margin signal, which at `depthCap=4` is uniform across most COIN operations.

This document specifies the issues in detail, surveys the surrounding DSL surface for context, lists four candidate fix options graded against `docs/FOUNDATIONS.md`, and flags open questions that benefit from external research.

---

## 2. Background — the campaign and what brought us here

### 2.1 Campaign

`campaigns/fitl-arvn-agent-evolution/` is an improve-loop optimization campaign aiming to evolve the ARVN policy profile (`data/games/fire-in-the-lake/92-agents.md`'s `arvn-evolved` block) so that an ARVN agent reliably wins or rank-leads in 4-faction Fire in the Lake games. The primary metric is `compositeScore = avgMargin + 10 × winRate` measured over 15 seeds (1000–1014). The optimization mutates only `arvn-evolved` and the library items it consumes; the three baseline profiles (us/nva/vc-baseline) are controls.

### 2.2 What today's session resolved

The session started with an apparent "tier-1 unwinnable, seed 1000 -6 ceiling" verdict from prior runs. Investigation surfaced a FITL game-encoding bug: `data/games/fire-in-the-lake/90-terminal.md`'s five victory checkpoints (`us/arvn/nva/vc-victory`, `final-coup-ranking`) were gated on `count of isCoup cards in played:none == 1`, which (since nothing clears the played pile after a Coup Round resolves) meant only the first Coup card could ever trigger a winner. Per FITL Rules §7.2 ("Check victory at the start of *each* Coup Round"), the precondition was wrong. Fixed in commit `edb7a68f6`; engine `default` lane (65/65) and full `integration` lane (275/275) both pass post-fix. The new post-fix tier-15 baseline is `compositeScore = -3.8`, `avgMargin = -5.8`, `wins = 3/15` (seeds 1003, 1009, 1013 — including a coup-#2 win on seed 1009 that directly proves the multi-coup play path the bug had previously blocked).

Detail: `reports/fitl-coup-victory-checkpoint-bug-2026-05-11.md`.

### 2.3 What today's session uncovered next

The post-fix campaign immediately hit a plateau at `-3.8`. Three lines of investigation surfaced the gap reported here:

1. **ARVN action-type distribution** (across 15 seeds, baseline profile):
   - `govern` 118 main-action selections (75%)
   - `train` 24 (15%)
   - `event` 10 (6%)
   - `transport` 6 (4%)
   - `patrol`, `sweep`, `assault`, `raid`, `advise`, `pivotalEvent`, `pass`: **0 each**

   For comparison, opponents across the same 15 seeds:
   - US plays events 32% of main actions
   - NVA plays events 40%
   - VC plays events 6%
   - ARVN plays events **2.3%**

2. **When ARVN does play events, side distribution**:
   - Baseline: 4 / 10 (40%) shaded (anti-COIN side)
   - exp-006-pf (after adding `preferEvent`): 6 / 12 (50%) shaded
   - Specific seeds where ARVN played the *insurgent-favoring* shaded side: seed 1001 card-78, seed 1005 card-63 `rm-sup-patronage` (literally removes ARVN support + patronage), seed 1005 card-87, seed 1006 card-63 `rm-sup-patronage` (again), seed 1010 card-10, seed 1012 card-8.

3. **Why margin signal can't fix this on its own**: per-candidate inner preview operates at `depthCap=4` (cap class `standard256`). At that depth, the synthetic completion of a card-event play typically resolves only the immediate effect; downstream effects that play out through subsequent factions' turns are not part of the projection. So `preferProjectedSelfMargin` and `preferStrongNormalizedMargin` cannot reliably rank shaded vs unshaded variants of the same event card. They're not broken — they simply do not see far enough.

---

## 3. The architectural gap — specification

### 3.1 What the agent DSL exposes today (action-selection scope)

A candidate consideration with `scopes: [move]` may read the candidate via the following ref kinds. Source: `packages/engine/src/contracts/policy-contract.ts:29-35` (`AGENT_POLICY_CANDIDATE_INTRINSICS`) and `packages/engine/src/kernel/types-core.ts:402-470` (`CompiledAgentPolicyRef` union).

| Surface | What it reads | Example |
|---|---|---|
| `candidate.tag.<actionId>` | Boolean — does this candidate's action ID match the tag? (driven by `actionTagIndex.byAction[actionId]`) | `{ ref: candidate.tag.govern }` |
| `candidate.intrinsic.actionId` | The candidate's action ID string | `actionId` is one of `AGENT_POLICY_CANDIDATE_INTRINSICS` |
| `candidate.intrinsic.stableMoveKey` | The candidate's stable move key (a string that *contains* params as a JSON fragment) | `stableMoveKey` |
| `candidate.intrinsic.paramCount` | The number of params on the candidate | `paramCount` |
| `feature.<stateFeature>` | Game-state-derived state feature (reads current state, not candidate-specific) | `feature.coinControlPop` |
| `feature.<candidateFeature>` | Derived candidate feature (typically coalesces `preview.*` over `feature.*`) | `feature.projectedSelfMargin` |
| `preview.victory.<...>`, `preview.feature.<...>` | Projected scalar metrics from inner-preview synthetic-completion endpoint | `preview.victory.currentMargin.self` |
| `aggregate.<id>` | Sum/min/max/count over all candidates' projected values | `aggregate.maxMarginScore` |

### 3.2 What it does NOT expose

- **Per-candidate move-param values**: `candidate.param.<name>` *authoring* is **retired** per `docs/agent-dsl-cookbook.md:102` ("Action-selection candidates now use a bounded synthetic-completion driver by default, so `preview.*` refs project through same-seat inner microturns *without reviving retired `decision.*`, `option.value`, or `candidate.param.*` authoring*."). The kernel `CompiledAgentPolicyRef.kind = 'candidateParam'` discriminant still exists internally (used by `compile-agents.ts:415` for `candidateParamDefs`), but there is no documented YAML surface to read `candidate.param.side` or `candidate.param.eventCardId` from a consideration.
- **Per-candidate move-param tags**: candidates inherit their action's tags exactly. All `event` candidates carry only `event-play`, regardless of side or branch.
- **Per-candidate game-state-conditional features**: `feature.<stateFeature>` reads game state, not candidate-specific projected state. The only candidate-specific signal available to score-bearing considerations is preview-derived (`preview.*`, `feature.<candidateFeature>` over `preview.*`).

### 3.3 The retirement rationale (inferred — needs verification)

`option.value` and `candidate.param.*` authoring were retired together with the move to bounded synthetic-completion preview (spec 145 era, refined by 158/162/163/164/165). The likely reason: a `candidate.param.side` ref at action-selection would have to commit to a single param-name namespace shared across all games, which conflicts with Foundation #6 ("Schema Ownership Stays Generic — no per-game schema files"). The retirement chose to push all per-option discrimination into microturn scope (`microturn.option.value`, `microturn.option.tags`, `microturn.option.targetKind`, etc., in `AGENT_POLICY_MICROTURN_OPTION_INTRINSICS`) where chooseN/chooseOne frontiers expose typed enum/binding/zone option values whose semantics are uniform across games.

The unintended consequence: actions like Card Event and Pivotal Event do *not* lower their side/branch/card choice into a microturn before action selection. They expose those choices as part of the action-selection candidate itself. The retirement therefore leaves a hole at the boundary of "is the choice a microturn frontier or a candidate parameter?" — when it's the latter, no DSL discrimination exists.

### 3.4 Concrete actions affected in FITL

| Action | Has per-candidate params at action-selection? | Param names | Discriminable today? |
|---|---|---|---|
| `event` | **Yes** | `eventCardId`, `eventDeckId`, `side`, `branch` (optional) | No — only via projected margin, which is unreliable past `depthCap=4` |
| `pivotalEvent` | **Yes** | `eventCardId` (one of card-121..card-124) | No |
| `govern` | No (target zones decided in chooseN microturn after selection) | — | Yes, at microturn scope via `microturn.option.value` (zone id) + Spec 163/165 lookups |
| `train` | No | — | Yes, microturn scope |
| `patrol` | No | — | Yes, microturn scope |
| `sweep` | No | — | Yes, microturn scope |
| `assault` | No | — | Yes, microturn scope |
| `advise` | No | — | Yes, microturn scope |
| `transport` | No | — | Yes, microturn scope |
| `raid` | No | — | Yes, microturn scope |
| `pass` | No params | — | Trivially via `candidate.tag.pass` |

The gap is specifically about the "Yes" rows. Same shape would apply to any future game whose action-selection candidates carry semantically-loaded params (e.g., role-selection, faction-of-target, card-pick) without first descending into a microturn.

### 3.5 A second-order issue: action-class boosts are the only practical knob at uniform-margin frontiers

This is a *consequence* of the primary gap rather than a separate gap, but worth surfacing because it shapes the campaign's tuning landscape.

When the bounded preview can't differentiate action candidates (margin uniform across govern/patrol/sweep/assault/train at `depthCap=4`), the *only* per-action-type discriminator left is the hand-tuned action-tag boost (`preferGovernWeighted=1000`, `trainWhenControlLow=500 (conditional)`, etc.). There is no library scoring path that says, e.g., "prefer patrol candidates whose target zone contains underground guerrillas" without committing to a per-game stateFeature plus a microturn-scope consideration *inside* the patrol action. Patrol is never chosen at action-selection at all if it doesn't get a hand-tuned per-action-type boost.

This is a tuning issue in principle — but it means the agent's action-class selection is essentially a lookup table rather than a state-conditional policy. Mitigating it within current authoring surfaces would require a library expansion (more `preferXAction` conditionals like `patrolWhenGuerrillasUnderground`) plus a per-game feature library to drive each conditional. That's authoring-side work, not engine-side work, but it scales linearly with the action × condition cross product.

---

## 4. Alignment with `docs/FOUNDATIONS.md`

Any fix must respect at least the following foundations. (Full text in `docs/FOUNDATIONS.md`.)

- **#1 Engine Agnosticism**: no per-game knowledge in engine/compiler. So a fix cannot hardcode "side" or "eventCardId" — it must work for any param name authored in any game's GameSpecDoc.
- **#5 One Rules Protocol, Many Clients (constructibility clause)**: every kernel-published legal action is directly executable at its microturn scope. The candidate's params *are* part of its published shape; reading them at action-selection is reading already-published data.
- **#6 Schema Ownership Stays Generic**: no per-game schema files. Whatever surface is added must accept generic param names; it must not enumerate "side", "branch", "eventCardId" at compile time. The lookup must traverse a typed param-name space declared in GameSpecDoc.
- **#7 Specs Are Data, Not Code**: no eval / scripts. A new ref kind must be a declarative read; no expression-language extension that allows arbitrary code paths.
- **#8 Determinism Is Sacred**: any new ref kind must produce a deterministic, type-stable value regardless of host platform; integer/boolean/enum-string only, with explicit fallback for missing params.
- **#10 Bounded Computation**: a candidate-param lookup is `O(1)` per option per ref. No new search loops.
- **#12 Compiler-Kernel Validation Boundary**: the compiler should reject considerations that reference a param name the action's `params: [...]` declaration doesn't define. Reference resolution belongs at compile time.
- **#14 No Backwards Compatibility**: if `candidate.param.*` is being un-retired or replaced, the cookbook and any retired-comment block must move with the change. No alias paths.
- **#17 Strongly Typed Domain Identifiers**: a candidate-param value typed as `ZoneId` / `PlayerId` / `TokenId` should remain branded through the read; the consideration's expression system already accepts branded scalars.
- **#19 Decision-Granularity Uniformity**: parity argument — `microturn.option.value` lets the agent discriminate chooseOne / chooseN options by their option value (a typed scalar). The same should hold at action-selection where candidates carry typed param scalars. The two scopes' discrimination capabilities should be equivalent up to the difference in what's being chosen.
- **#20 Preview Signal Integrity**: a candidate-param read is *not* a preview-derived ref. It reads pre-published candidate state and never requires a synthetic-completion drive. It should never appear in `unknownPreviewRefs[]` and should never trigger `tiebreakAfterPreviewNoSignal`. Its semantics are state-local and instantaneous.

The relevant prior specs to consult during the fix design:

- **Spec 158** — microturn policy scope and `microturn.option.value` intrinsic
- **Spec 162** — preview signal integrity (the foundation for #20 above)
- **Spec 163** — generic microturn state-feature lookups (the precedent for game-agnostic typed key/path access)
- **Spec 164** — continued inner-preview deepening + cap-class registry
- **Spec 165** — projected-state lookup refs (the precedent for surface union extension; `lookup.surface: 'policyState' | 'previewOptionState'`)

Spec 165 §4.1-4.6 is especially worth studying as a template for how to extend a ref family generically while preserving Foundations #4 / #20 contracts.

---

## 5. Fix options

Each option is a candidate path. None is mutually exclusive with the others; option (3) in particular may be a complement to (1) or (2). Trade-offs are listed for each.

### Option A — Un-retire `candidate.param.*` authoring as a typed ref family

Add (or revive) a `candidate.param.<name>` ref kind that reads the candidate's `params[name]` value. Compile-time validation rejects names not declared in the action's `params: [{name, domain}]` block. The value carries the param's declared type (enum string, branded ZoneId, etc.).

YAML shape (proposed):

```yaml
penalizeShadedEvent:
  scopes: [move]
  weight: 800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.param.side }
        - shaded
  # negative weight effectively makes this a penalty
```

**Pros**:
- Minimal new surface area; the kernel discriminant already exists (`candidateParam` in `CompiledAgentPolicyRef`).
- Compile-time-resolvable; no preview drive needed.
- Directly addresses the FITL event-side problem with a one-line consideration.
- Preserves Foundation #6: `params: [{name, domain}]` already declares the per-game param schema generically.

**Cons**:
- Re-introduces a retired surface — needs the cookbook to be updated (no alias paths per #14) and the rationale for the original retirement to be debunked. If the original retirement was motivated by something we don't yet understand, restoration could re-introduce that pathology.
- Needs to handle absent params (some candidates of the same action may not have all params, e.g., events without branches). Resolution rule must be deterministic — likely `onMissing: 'unavailable' | {kind: 'constant'; value}` analogous to Spec 163's lookup discriminants.

**Open research question**: Why was `candidate.param.*` retired in the first place? Was it ambiguity at *preview* time (the preview drive sees candidate params from the *outer* candidate, not the inner microturn's option, and authors confused the two)? If so, the un-retirement needs to distinguish "outer-candidate param" from "inner-option value" cleanly. Spec 158's introduction of `microturn.option.*` solves the inner case; restoring `candidate.param.*` would solve the outer case symmetrically.

### Option B — Add a `candidate.params.<name>` ref kind (new namespace)

Same semantic as Option A but under a new, distinct namespace to avoid colliding with retired authoring patterns. The compiler accepts `candidate.params.<name>` and rejects `candidate.param.<name>` (the singular retired form). This preserves the retirement decision in spirit while opening a new clearly-scoped surface.

**Pros**:
- Avoids the "is this the same retired surface?" question entirely.
- Naming parallels `microturn.option.value` / `microturn.option.tags` etc. — symmetric vocabulary.

**Cons**:
- Slightly more compiler work (reject one ref kind by name while accepting the new one).
- A bit of "two-namespaces-for-the-same-idea" smell unless the original retirement reason is genuinely orthogonal.

### Option C — Tag-time enrichment: emit dynamic per-candidate tags

At candidate generation (`packages/engine/src/kernel/legal-moves.ts:1273-1325` for events), the kernel emits dynamic tags derived from candidate params. For FITL events: tags `event-shaded` / `event-unshaded`. For pivotal events: tags `pivotalEvent-card-121`, `pivotalEvent-card-122`, ... The library then authors `penalizeShadedEvent` as a normal `candidate.tag.event-shaded` consideration.

**Pros**:
- Reuses the existing `candidate.tag.<X>` authoring surface — no new ref kind needed.
- Compile-time-resolvable.
- Tags can be game-agnostic in mechanism: GameSpecDoc declares, per action, which params to expand into tag-form (`tagFromParams: [{paramName, tagPrefix}]` or similar). The expansion is generic; the per-game choice of *which* params to expand is authored.

**Cons**:
- Adds GameSpecDoc surface for declaring param-to-tag expansion. Not free.
- Cartesian product explosion: an action with N param values produces N tags per candidate. For pivotal events with 4 cards that's 4 tags; for events with 2 sides × ~3 branches that's up to 6 tags per candidate. Manageable but worth measuring against the existing tag index's lookup cost.
- Less elegant than reading the param directly; an author who wants the numeric value (not boolean tag presence) for branched comparison still needs Option A/B.

### Option D — Lower side/branch selection into a microturn

Refactor card-event resolution so the side choice is a `chooseOne(shaded, unshaded)` microturn published *after* selecting `event`, rather than baked into the action-selection candidate's params. Same for pivotal-event card selection. The existing `microturn.option.value` intrinsic then suffices for discrimination.

**Pros**:
- Aligns with Foundation #19: every kernel-visible decision becomes a microturn, no exceptions for events.
- Reuses the existing microturn discrimination surface (zero new ref kinds).
- Reduces action-selection candidate count: one `event` candidate per card, instead of one per (card × side × branch).

**Cons**:
- Largest refactor of the four. Touches:
  - `enumerateCurrentEventMoves` in `legal-moves.ts`
  - `event-execution.ts`'s side/branch dispatch (`packages/engine/src/kernel/event-execution.ts:320-390`)
  - The event-side selection ordering / eligibility windows
  - Probably some replay fixtures pinned against the current event-candidate shape
- Migration: existing trace data, replays, and golden fixtures encoded with `params.side` would need a migration story (Foundation #14 — no compat shims — means all repo-owned artifacts move together).
- Doesn't address Pivotal Events as cleanly (card identity *might* genuinely belong at action selection because it carries eligibility, not just a post-selection choice).
- Doesn't help with the secondary issue described in §3.5 — operations that lack a per-action-type heuristic still won't get chosen.

### Cross-cutting consideration — observer projection

Whichever option lands, the candidate-param read must respect Foundation #4 (Authoritative State and Observer Views). For ARVN reading "what side am I about to play this event on?", there's no observer-visibility concern — the agent has full knowledge of the move it's about to make. But for principles' sake, any new ref kind should follow Spec 163's pattern: `onHidden: 'unavailable'` is non-overridable, and the compile-time validation enforces it.

---

## 6. Recommendation (preliminary, subject to ChatGPT-Pro's deep-research review)

If forced to pick today, I lean toward **Option A** as the primary fix, with **Option C** considered as a secondary convenience.

- Option A is the smallest change that fully closes the gap.
- The kernel discriminant `candidateParam` already exists in `CompiledAgentPolicyRef`; we are reviving documented authoring on top of an already-validated runtime channel.
- The retired-authoring decision came from a specific era of preview-driven authoring that has since matured (Spec 158/162/163/164/165). The original justification for retirement may no longer apply with the current preview architecture.
- Option C is attractive for ergonomics (the author writes a single tag name rather than an `eq` expression), but it adds a non-trivial GameSpecDoc surface and a tag-emission pipeline. Worth it only if multiple games' authoring patterns would benefit from "tag from param", not just FITL.
- Option D is structurally cleanest but is the largest refactor and may be over-broad for the immediate need. Worth queuing as a longer-term Foundation #19 hardening but not as the immediate FITL agent-evolution unblocker.

This recommendation may be wrong; specifically, ChatGPT-Pro should:
1. Surface the original retirement rationale (likely in retired-spec commit messages, prior musings, or COIN-series prior art).
2. Compare to how other declarative-rules engines for COIN-style games handle action-parameter scoring (e.g., is there a canonical "candidate.params.<name>" authoring pattern from another framework that we could borrow vocabulary from?).
3. Validate that Option A's revival doesn't conflict with Spec 162's anti-clairvoyance posture for preview drives (it shouldn't — candidate-param reads are pre-drive — but worth confirming).

---

## 7. Open questions for deep research

1. **Why was `candidate.param.*` retired?** Search for the original retirement commit / spec / report. Is the original motivation still valid post-Spec 158/162/163/164/165?
2. **Does any analogous declarative-rules engine** (e.g., other COIN-series digital adaptations, the Cube AI agent DSLs, the BoardGameArena rules engine, or any open-source policy-DSL framework) expose action-selection candidate params to scoring/heuristic considerations? What is the canonical vocabulary and validation discipline?
3. **For Option D**, would lowering event side/branch into a microturn break game-rule semantics? Specifically — in FITL, the side choice interacts with the option-matrix system (operation+SA vs event vs limited-op). Is "event" at action-selection actually picking a *card+side+branch tuple* atomically because the matrix considers them inseparable, or is the side choice independent of the matrix? Cite the rule sections.
4. **For Option C**, is there a generic per-game-author-declared `tagFromParams: [...]` mechanism that fits Foundation #6 (no per-game schema)? Or does this collapse to a special case of Option A?
5. **Beyond events**: are there other action classes in the existing FITL spec (or in Texas Hold'em) where action-selection candidates carry semantically-loaded params? The `30-rules-actions.md` action table shows `pivotalEvent` has `params: [{name: eventCardId, ...}]` — same shape as events. What about future games?
6. **§3.5 secondary issue**: should fixes (1)/(2)/(3) be paired with a Spec 162-derived "preview-uniform-margin fallback to authored heuristics" channel? E.g., if `preferProjectedSelfMargin`'s preview-driven contribution is uniform across action types, fall back to per-action-type authored conditions? Or is this just an authoring concern (write more `preferXAction` conditionals)?
7. **Foundation #20 boundary**: where should the new ref-resolution failure modes live in the trace? `unknownPreviewRefs` is for preview-derived; `unknownLookupRefs` is for current-state-keyed lookups. A `candidate.param.side` read where `side` doesn't exist on this candidate (e.g., an event with no branches) is neither — it's structurally absent. New category like `unknownCandidateParams`? Or fold into `unknownLookupRefs` with `surface: candidateParams`?

---

## 8. Reference: empirical artifacts

The campaign's worktree branch `improve/fitl-arvn-agent-evolution` (HEAD currently `bcdd6983f`, but the most recent meaningful state is `edb7a68f6` for the coup-victory fix plus the campaign's exp-003 ACCEPT at `e44533bc3`) contains all the trace and result data referenced above. Key paths:

- `campaigns/fitl-arvn-agent-evolution/results.tsv` — per-experiment metric history (tier-1 baseline, tier-2 baseline, exp-001 through exp-008 across two sessions; post-fix tier-15-baseline; post-fix exp-001-pf through exp-006-pf)
- `campaigns/fitl-arvn-agent-evolution/musings.md` — narrative trace of investigation including the bug-fix discovery
- `campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json` through `trace-1014.json` — full per-seed verbose traces
- `data/games/fire-in-the-lake/92-agents.md` — current `arvn-evolved` profile (5 considerations: `preferProjectedSelfMargin`, `preferStrongNormalizedMargin`, `preferGovernWeighted`, `trainWhenControlLow`, `preferOptionProjectedMargin`)
- `data/games/fire-in-the-lake/30-rules-actions.md:160` — event action def (`tags: [event-play]`, `params: []`)
- `data/games/fire-in-the-lake/30-rules-actions.md:993-999` — pivotalEvent action def (`params: [{name: eventCardId, domain: ...}]`)
- `packages/engine/src/contracts/policy-contract.ts:29-68` — `AGENT_POLICY_CANDIDATE_INTRINSICS`, `AGENT_POLICY_MICROTURN_INTRINSICS`, `AGENT_POLICY_MICROTURN_OPTION_INTRINSICS`, `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS`
- `packages/engine/src/kernel/types-core.ts:402-470` — `CompiledAgentPolicyRef` union (still includes `candidateParam` discriminant)
- `packages/engine/src/cnl/compile-agents.ts:415-438` — `lowerCandidateParamDefs` (compiler still produces `candidateParamDefs` per action)
- `packages/engine/src/kernel/legal-moves.ts:1273-1325` — `enumerateCurrentEventMoves` (where event params get baked into candidates)
- `packages/engine/src/kernel/event-execution.ts:320-390` — event branch/side dispatch
- `docs/agent-dsl-cookbook.md:102` — the line that retires `candidate.param.*` authoring
- `archive/specs/158-microturn-policy-scope.md` — the spec that introduced `microturn.option.*` (start here for the historical context of the retirement)
- `archive/specs/162-preview-signal-integrity.md` — Foundation #20 origin
- `archive/specs/163-generic-microturn-state-feature-lookups.md` — generic typed-lookup precedent for option-A authoring shape
- `archive/specs/165-projected-state-lookup-refs.md` — most recent surface-union-extension precedent

---

## 9. What to write back

A spec proposal (or specs) implementing one or a combination of the four options, with:

- Explicit Foundation alignment table (every relevant foundation, what the proposal preserves, what (if anything) it modifies).
- Concrete YAML authoring shape for each new ref kind / tag mechanism / microturn refactor.
- Compiler validation rules (which error codes, when they fire).
- Runtime resolver contract (what value type comes out, what happens on missing params, where it shows up in trace).
- Test plan partitioned into architectural-invariant / convergence-witness / golden-trace per `.claude/rules/testing.md`.
- Migration plan for repo-owned artifacts that change shape under the proposal (per Foundation #14, no compat shims).
- A worked end-to-end example: the FITL `penalizeShadedEvent` consideration written under the chosen proposal, plus the expected trace shape after the agent picks an event in seed 1001 (where today the agent picks card-78 SHADED) with the consideration active.
