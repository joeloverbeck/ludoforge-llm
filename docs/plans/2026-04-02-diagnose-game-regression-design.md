# Design: diagnose-game-regression skill

**Date**: 2026-04-02
**Status**: Approved

## Problem

Engine and game-spec changes (specs, tickets) can introduce game regressions that aren't caught until an evolution campaign fails. The investigation process is ad-hoc: manually running seeds, reading traces, grepping code. A systematic skill is needed to diagnose regressions efficiently and produce actionable output.

## Trigger

Invoked after any game regression signal — failed improve-loop, unexpected simulation results, post-spec validation failure. Requires a written report file describing symptoms.

## Approach

Single skill (`/diagnose-game-regression <report-path>`) with 7 steps:

1. Read report, auto-detect affected game
2. Traceability assessment — run 1 seed, verify trace quality, produce traceability tickets if gaps found
3. Diagnostic simulation — run single-seed game with detailed tracing, parse for anomalies
4. Root cause analysis — trace through codebase to find engine bugs, data gaps, visibility issues
5. Classify findings — architectural → spec, data fix → ticket, traceability → ticket
6. Write specs and tickets
7. Final summary with dependency graph and implementation order

## Key Design Decisions

- **Traceability is step 1**: if the game doesn't produce enough trace data to diagnose the problem, improving traceability is the first output — before any fix tickets.
- **Spec vs ticket boundary**: engine architectural changes produce specs (consumed by `/reassess-spec` → `/spec-to-tickets`). Data fixes (tags, config, observability) produce direct tickets.
- **Live simulation**: the skill runs at least 1 game seed to produce a fresh trace, ensuring diagnosis is based on current engine behavior, not stale data.
- **Report-driven**: input is always a report file, not verbal symptoms. This ensures evidence is documented before diagnosis begins.

## Downstream Workflow

```
Report (from failed campaign or manual testing)
  → /diagnose-game-regression reports/foo.md
    → produces specs/108-bar.md + tickets/DIAG-001.md
  → /reassess-spec specs/108-bar.md (for architectural specs)
    → /spec-to-tickets specs/108-bar.md NAMESPACE
  → /implement-ticket tickets/DIAG-001.md (for data fix tickets)
```
