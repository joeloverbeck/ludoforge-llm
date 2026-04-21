# Spec 142: Card-Driven Campaign-End and Final-Coup Semantics

**Status**: Draft  
**Priority**: P1  
**Complexity**: M  
**Dependencies**: Spec 17, Spec 19, Spec 140, Spec 141 (parallel-friendly; no hard dependency on implementation order)  
**Estimated effort**: 2-4 days  
**Source**: `tickets/FITLDETBOUND-001.md`, FITL boundedness investigation on 2026-04-21

## Overview

Define a generic architectural contract for campaign-end evaluation in card-driven games, with FITL as the motivating witness.

The current engine correctly supports card lifecycle, coup phases, and terminal checkpoints, but the last FITL boundedness blocker exposed a missing semantic distinction:

- “no more cards remain”
- “no more future coup cards remain”
- “the currently played coup is the final coup even if coup-round execution is suppressed”

This spec clarifies those concepts and how authored terminal rules may depend on them. The goal is not to hardcode FITL behavior into the engine. The goal is to define a precise card-driven termination model that authored YAML can express without ambiguity.

## Problem

`FITLDETBOUND-001` exposed a real rules/architecture gap.

The production encoding originally defined FITL final-coup termination too narrowly: it only fired when the currently played coup card was in a coup phase and both `deck:none` and `lookahead:none` were empty.

That missed a real game state:

- the currently played card is the final coup
- no future coup cards remain
- ordinary event cards still remain in the future stream
- coup-round execution is suppressed because the previous round was already a coup

In that state, the game should end on the final coup, but the engine instead continued into more `main`-phase card flow and, in the pathological seeds, eventually drifted into empty-card action publication.

The local FITL rule fix is correct, but the architectural lesson is broader: card-driven games need a precise authored model for “current card”, “future card stream”, and “campaign-end boundary”.

## Goals

- Define generic engine semantics for authored card-driven campaign-end checks.
- Distinguish “future stream” conditions from “current phase” conditions.
- Allow authored terminal checkpoints to fire in any phase where the rule-authoritative end condition is satisfied, including non-coup phases when appropriate.
- Make final-campaign/end-of-stream edge cases testable and deterministic.

## Non-Goals

- Hardcoding FITL-specific coup logic into the engine.
- Replacing authored terminal conditions with engine-owned FITL victory logic.
- Redesigning the full card-driven turn-flow model from Spec 17.

## Foundations Alignment

- **Foundation 2**: rule-authoritative campaign-end semantics must live in YAML.
- **Foundation 5**: terminal evaluation and turn retirement must use the same kernel protocol as every other client.
- **Foundation 10**: a card-driven game must retire at the correct authored boundary rather than drifting into extra decision states.
- **Foundation 15**: fix the end-of-campaign semantic gap at the model boundary, not via simulator-side stop heuristics.
- **Foundation 16**: campaign-end edge cases must be proven by focused regressions.

## Design

### 1. Card-driven terminal checks are stream-aware

The architecture must distinguish three authored concepts:

- `currentCard`: the currently played card
- `futureCards`: the card stream after the current card, including lookahead plus draw pile
- `futureCardsMatching(<predicate>)`: authored query/filter over future cards

Terminal conditions may depend on any of these concepts. A game is not limited to simple deck-emptiness checks.

### 2. Final-campaign checkpoints are phase-gated by rules, not by implementation accidents

A terminal checkpoint may be authored to fire in any phase whose rules meaningfully represents the campaign-end boundary.

If a game’s final boundary can arise in more than one execution shape, the authored checkpoint must be allowed to declare that directly.

For FITL, that means the final-coup boundary may arise in:

- `coupRedeploy`
- `main`, when the final coup is currently played but a coup round is suppressed by consecutive-coup rules

### 3. “No future coup cards remain” is not the same as “deck empty”

Card-driven end semantics must allow authored conditions over future-card classes, not just zone counts.

Examples:

- no future coup cards remain
- no future monsoon cards remain
- no future cards tagged `era=late` remain

This remains declarative YAML, not engine-owned game logic.

### 4. Turn-flow retirement must respect authored campaign-end semantics before publishing further card-driven action windows

Once authored terminal evaluation says the campaign is over, the kernel must not continue to:

- reveal more cards
- publish further action-selection microturns
- drift into empty-card `main` states

This requirement is generic and applies regardless of whether the terminal condition is win/loss/draw/score/final ranking.

## Required Changes

### Authored rule surface

- Document the intended authored pattern for card-stream-aware terminal checks.
- Prefer future-stream card-property queries over incidental zone-emptiness checks when the rule is about a class of future cards.

### Engine/runtime semantics

- Audit the turn-flow/terminal interaction to ensure terminal evaluation can stop publication at the authored boundary.
- Ensure card-driven games cannot keep advancing once an authored end-of-campaign checkpoint is satisfied.

### FITL correction

- Preserve the corrected FITL final-coup encoding as the canonical production witness.
- Make the suppressed-coup-round `main` case part of the permanent regression corpus.

## Acceptance Criteria

1. The engine architecture clearly distinguishes current-card and future-stream terminal semantics.
2. Authored terminal checkpoints may correctly express “final coup” or similar future-stream boundaries without relying on deck emptiness.
3. FITL final-coup termination works both in `coupRedeploy` and in the suppressed-coup-round `main` case.
4. No card-driven game may continue publishing action decisions after an authored end-of-campaign checkpoint is satisfied.

## Testing Requirements

- Focused integration regression for FITL final coup in `coupRedeploy` with leftover non-coup future cards.
- Focused integration regression for FITL final coup in `main` when coup-round execution is suppressed.
- Regression proving that once the authored terminal boundary is met, no further card-flow publication occurs.
- At least one generic kernel/terminal test exercising future-card-class terminal semantics outside FITL-specific fixtures.

## Follow-On Tickets

- Card-driven terminal-query helper surface and validation pass
- Turn-flow/terminal interaction audit for other card-driven titles
- FITL regression hardening around last-card, last-coup, and suppressed-coup-round traces
