---
name: runner-shell-ui-implement
description: "Use when the latest runner-shell UI evaluation is ready and the game selection plus pre-game configuration screens need implementation work. Reads reports/runner-shell-ui-evaluation.md, redesigns the runner pre-game shell, verifies with real browser checks on desktop and mobile, and leaves the report update to the next evaluate run."
---

# Runner Shell UI Implementation

Improve the runner pre-game shell using the latest evaluation in `reports/runner-shell-ui-evaluation.md`.

Scope:

- game selection screen
- pre-game configuration screen
- adjacent shell polish on those screens only

Out of scope:

- active game canvas
- replay UI
- map editor screens
- engine code

## Checklist

1. Read `docs/FOUNDATIONS.md`.
   Focus on:
   - Foundation 3: runner-only visual/product changes
   - Foundation 14: no compatibility shims
   - Foundation 15: solve the real product problem cleanly
2. Read the latest evaluation in `reports/runner-shell-ui-evaluation.md`.
   - Prioritize CRITICAL and HIGH recommendations.
   - If none exist, target the top 2-3 MEDIUM recommendations.
3. Read the current implementation surfaces before editing:
   - `packages/runner/src/ui/GameSelectionScreen.tsx`
   - `packages/runner/src/ui/GameSelectionScreen.module.css`
   - `packages/runner/src/ui/PreGameConfigScreen.tsx`
   - `packages/runner/src/ui/PreGameConfigScreen.module.css`
   - `packages/runner/src/App.tsx`
   - `packages/runner/src/bootstrap/bootstrap-registry.ts`
4. Read the focused tests up front:
   - `packages/runner/test/ui/GameSelectionScreen.test.tsx`
   - `packages/runner/test/ui/PreGameConfigScreen.test.tsx`
   - `packages/runner/test/ui/App.test.ts`
   - `packages/runner/test/ui/tokens.test.ts`
5. Treat visible product bugs as first-class implementation work, not just styling cleanup.
   Examples:
   - formatting fixed player counts correctly
   - removing invalid control patterns such as a fixed-value slider
   - improving empty/loading/validation states
   - clarifying metadata and actions
6. Prefer shared shell primitives when they improve architecture.
   Allowed examples:
   - shared screen header/hero
   - shared card styles
   - shared metadata badge rows
   - shared form section patterns
7. Keep the redesign broad enough to feel intentional and polished.
   Do not stop at superficial spacing tweaks if the page still feels like scaffolding.
   - In late-stage editorial polish passes, prefer distinctions driven by existing metadata patterns such as fixed vs variable seats or named vs generic seat roles before reaching for generic shell prose changes.
8. If the latest evaluation or current code reveals an ambiguity about scope or architecture, use the 1-3-1 rule before proceeding.
9. Run verification:
   - focused runner tests first
   - confirm the chosen Vitest command actually narrows scope; if it still executes the broad suite, rerun with a command shape that demonstrably filters before moving on
   - broader runner checks after that
10. Reuse a healthy existing local dev server if one exists; otherwise start `npm run dev` in `packages/runner`.
   - If startup fails because the sandbox cannot bind the local port, immediately retry with escalation. Treat that as an environment constraint, not an application defect.
11. Verify the redesigned flow in a real browser on:
   - desktop viewport
   - narrow/mobile viewport
   - selection screen across all game cards
   - config screen for every available game
   - After capture, inspect the actual screenshot images before concluding the redesign is acceptable. Do not rely only on DOM or accessibility snapshots.
   - When preserving earlier evaluation artifacts is useful, use implementation-pass screenshot suffixes such as `implement2` or `pass2` so the new captures are easy to compare against prior eval images.
12. Do not update the evaluation report in this skill. The next `runner-shell-ui-evaluate` run owns the write-up.
   - If code review plus browser verification show that the latest evaluation targets are already effectively satisfied, it is valid to stop after verification and report that no further implementation was warranted in this pass.
13. If any code changes are made after the first browser review, rerun the relevant focused checks and the final broader verification again before concluding.
14. If you started a temporary dev server for verification, stop it before concluding unless there is a clear reason to leave it running.

## Implementation Priorities

Default priority order:

1. product correctness problems visible on the screens
2. hierarchy and flow clarity
3. control appropriateness
4. polish, accessibility, and responsiveness

If a recommendation can be addressed only by touching both selection and config screens, prefer a shared solution over parallel ad hoc fixes.

Before concluding, confirm which evaluation findings were:

- addressed in this pass
- intentionally deferred
- no longer applicable after implementation

For refinement passes driven by an existing evaluation, make those buckets explicit in the final answer rather than implying them indirectly.
Also state explicitly whether the latest evaluation's remaining items were rechecked in the browser and whether each one now appears resolved.

## Key Files

Primary:

- `packages/runner/src/ui/GameSelectionScreen.tsx`
- `packages/runner/src/ui/GameSelectionScreen.module.css`
- `packages/runner/src/ui/PreGameConfigScreen.tsx`
- `packages/runner/src/ui/PreGameConfigScreen.module.css`
- `packages/runner/src/App.tsx`
- `packages/runner/src/bootstrap/bootstrap-registry.ts`

Possible adjacent architecture files:

- `packages/runner/src/ui/shared.module.css`
- `packages/runner/src/ui/README.md`
- `packages/runner/src/session/session-store.ts`

Tests:

- `packages/runner/test/ui/GameSelectionScreen.test.tsx`
- `packages/runner/test/ui/PreGameConfigScreen.test.tsx`
- `packages/runner/test/ui/App.test.ts`
- `packages/runner/test/ui/tokens.test.ts`

## Browser Verification Expectations

Use real browser automation and capture fresh screenshots under `screenshots/runner-shell-ui/`.

Verify at minimum:

- the selection page feels designed, not placeholder-like
- all cards are scannable and comparable
- fixed player counts are presented correctly
- primary and secondary actions are clearly differentiated
- the config page uses appropriate controls for each game
- fixed-player games do not expose misleading player-count controls
- seat setup, seed input, and validation messaging are understandable
- the mobile layout remains coherent and tappable

Optional late-stage comparison checklist:

- compare the latest browser screenshots directly against the remaining recommendations from the most recent evaluation
- note whether each target is fully resolved or only improved
- keep at least one explicit residual item only if it still clearly needs another evaluation or implementation pass

## Test Expectations

At minimum, run:

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`

If the implementation changes shared runner shell primitives or app flow, run any additional focused checks needed to keep confidence high.

## Guardrails

- No engine changes.
- No GameSpecDoc rule-authoritative changes unless a separate confirmed ticket requires them.
- No screenshot-based test fixtures or visual snapshot tests.
- Use Playwright or equivalent browser automation for verification only.
- Prefer professional, distinctive UI over generic default React app styling.
- If you add shared shell components, keep them reusable and scoped to the runner shell rather than hardcoding FITL-only language.
