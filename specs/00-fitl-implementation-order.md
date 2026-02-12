# Spec 00-FITL: FITL Implementation Priority Order

**Status**: Draft
**Priority**: P0
**Complexity**: S
**Dependencies**: None
**Estimated effort**: 0.5 days
**Source sections**: Brainstorming Section 6 (Phased Implementation Plan)

## Overview

This document defines the implementation priority order, dependency graph, milestones, and verification gates for encoding Fire in the Lake (FITL) as a fully playable GameSpecDoc. It maps the 22 brainstorming tasks across 9 implementation specs (23–31).

## Dependency Graph

```
Spec 23 (Map + Pieces) ──────────────────────────────────┐
    │                                                     │
    v                                                     v
Spec 24 (Scenarios)                           Spec 25 (Mechanics Infra)
    │                                                     │
    │              ┌──────────────────────────────────────┤
    v              v                                      v
    Spec 26 (Operations Full Effects) ──> Spec 27 (SAs Full Effects)
         │                                     │
         └─────────────┬───────────────────────┘
                       v
         Spec 28 (Capabilities + Momentum + RVN Leader)
                       │
                       v
         Spec 29 (Event Cards) ──────> Spec 30 (Non-Player AI)
                       │                       │
                       └───────────┬───────────┘
                                   v
                        Spec 31 (E2E Tests)
```

## Milestones

### Gate A: Data Foundation (Specs 23–24)

**Criteria**: Full ~60-space map, 229 pieces, all 3 scenarios compile and validate.

- All spaces with correct attributes, adjacency, terrain, population, econ, coastal
- Adjacency graph matches brainstorming Section 11
- 229 pieces total across all factions
- 3 scenarios with initial placements, track values, deck composition
- Piece conservation: placed + available + out-of-play = total per type
- Build and existing tests pass

### Milestone B: Infrastructure Ready (Spec 25)

**Criteria**: Derived values, stacking enforcement, dynamic sourcing, free operations all work.

- Victory metrics compute correctly for all 4 factions
- Stacking violations rejected (max 2 bases, no bases on LoCs, NV restrictions)
- Dynamic piece sourcing with US exception
- Free operations don't cost resources or affect eligibility
- Total Econ computed correctly from COIN-controlled non-sabotaged LoCs
- Joint operation cost constraint works (US spending limited by Total Econ)

### Milestone C: Operations + SAs Complete (Specs 26–27)

**Criteria**: All 8 operations and 12 special activities have complete effect implementations (no stubs).

- Multi-space targeting via `chooseN` + `forEach`
- Piece removal follows ordering constraints (Troops first, Bases last)
- Operation/SA interleaving model resolved and implemented
- Monsoon restrictions enforced on SAs
- All existing integration tests pass or are updated

### Milestone D: Modifiers Active (Spec 28)

**Criteria**: All 19 capabilities, 16 momentum markers, and RVN Leader effects operational.

- Capability conditional branches on affected operations
- Momentum prohibitions and formula modifications
- Momentum expiry at coup Reset
- RVN Leader bonus applies correctly (e.g., Minh +5 Aid on Train)

### Milestone E: Events Encoded (Spec 29)

**Criteria**: All 130 event cards encoded and validated.

- 13 tutorial cards (Phase 1)
- 24 period-1964 cards (Phase 2)
- 48 period-1965 cards (Phase 3)
- 48 period-1968 cards (Phase 4)
- 6 coup cards + 4 pivotal events (Phase 5)
- Dual-use cards have both unshaded/shaded sides
- Cards reference capabilities/momentum correctly

### Milestone F: Bot AI Operational (Spec 30)

**Criteria**: Section 8 non-player AI for all 4 factions; solitaire playable.

- Per-faction priority tables
- Deterministic given same seed
- Bot games reach terminal state
- Bot-vs-bot simulation for evaluation pipeline

### Gate G: E2E Validated (Spec 31)

**Criteria**: Tutorial Turn 1 matches narrative; property tests pass.

- Turn 1 E2E matches brainstorming Section 12 narrative exactly
- 13-card campaign resolves correctly
- Property tests pass for 1000+ random iterations
- Golden tests for compilation and trace
- Determinism tests: same seed + same moves = identical hash

## Phase-to-Milestone Mapping

| Brainstorming Phase | Description | Specs | Milestone |
|---|---|---|---|
| Phase 1 | Tutorial Turn 1 E2E | 23, 24, 25, 26 (partial), 27 (partial) | Gate A + B + partial C |
| Phase 2 | Extended Tutorial (13 cards) | 26, 27, 28, 29 (tutorial cards) | C + D + partial E |
| Phase 3 | Capabilities & Momentum | 28 | D |
| Phase 4 | Full 1964 Card Set | 29 (1964 cards) | partial E |
| Phase 5 | Non-Player Rules | 30 | F |
| Phase 6 | Full Game | 29 (remaining cards), 31 | E + G |

## Task-to-Spec Mapping

| # | Brainstorming Task | Spec |
|---|---|---|
| 1 | Full Map (~60 spaces) | 23 |
| 2 | Full Piece Catalog (229 pieces) | 23 |
| 3 | Scenario Setups (3 scenarios) | 24 |
| 4 | Operations Full Effects (8 ops) | 26 |
| 5 | Special Activities Full Effects (12 SAs) | 27 |
| 6 | Multi-Space Operations | 26 |
| 7 | Operation/SA Interleaving | 26 |
| 8 | Piece Removal Ordering | 26 |
| 9 | Dynamic Piece Sourcing | 25 |
| 10 | Capabilities System (19) | 28 |
| 11 | Momentum System (16) | 28 |
| 12 | Event Card Encoding (130 cards) | 29 |
| 13 | Derived Value Tracking | 25 |
| 14 | Free Operations | 25 |
| 15 | Stacking Limits | 25 |
| 16 | RVN Leader Lingering Effects | 28 |
| 17 | LoC Type Distinction | 23 |
| 18 | Non-Player AI | 30 |
| 19 | E2E Tutorial Tests | 31 |
| 20 | Property Tests | 31 |
| 21 | Golden Tests | 31 |
| 22 | Determinism Tests | 31 |

## Effort Summary

| Spec | Title | Priority | Complexity | Est. Days |
|---|---|---|---|---|
| 23 | Full Map and Piece Data | P0 | L | 2–3 |
| 24 | Scenario Setups | P0 | M | 2–3 |
| 25 | Game Mechanics Infrastructure | P0 | L | 4–5 |
| 26 | Operations Full Effects | P0 | XL | 5–7 |
| 27 | Special Activities Full Effects | P0 | L | 4–5 |
| 28 | Capabilities, Momentum, RVN Leader | P1 | L | 3–4 |
| 29 | Event Card Encoding | P1 | XL | 8–12 |
| 30 | Non-Player AI | P1 | L | 4–5 |
| 31 | E2E Tests and Validation | P0 | L | 3–4 |
| **Total** | | | | **36–49** |

## Open Questions (Tracked Across Specs)

| # | Question | Affects Spec | Risk |
|---|---|---|---|
| 1 | ~~Derived value caching vs on-demand~~ **CLOSED**: On-demand computation. Caching contradicts immutable state architecture. Benchmark post-MVP. | 25 | ~~Medium~~ Resolved |
| 2 | RVN Leader as TriggerDef vs special system | 28 | Low — both approaches viable |
| 3 | Event card expressiveness ceiling | 29 | High — 5–10% of cards may need new primitives |
| 4 | Performance of full 130-card simulation | 31 | Medium — benchmark after Milestone C |
| 5 | ~~Stacking: compile-time vs runtime vs both~~ **CLOSED**: Both compile-time and runtime enforcement. Belt-and-suspenders, minimal extra code. | 25 | ~~Low~~ Resolved |
| 6 | Operation/SA interleaving model | 26 | High — architectural ripple through compiler and game loop |

## Risk Registry

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Op/SA interleaving requires deep kernel changes | High | Medium | Prototype early in Spec 26; accept composite-action model if simpler |
| Complex event cards exceed kernel expressiveness | High | Medium | Budget 5–10% escape hatches in Spec 29; add primitives as needed |
| 130-card simulation too slow for evolution | Medium | Low | Benchmark after Milestone C; add caching if needed |
| Tutorial turns 2–13 narrative not fully documented | Medium | High | Note as "data to be obtained from physical rulebook" in Spec 31 |
