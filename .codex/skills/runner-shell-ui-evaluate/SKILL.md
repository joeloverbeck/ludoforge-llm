---
name: runner-shell-ui-evaluate
description: "Use when evaluating the runner's pre-game shell UI: the game selection screen and pre-game configuration screen. Reuses or starts the runner dev server, captures desktop and mobile screenshots itself, scores the combined flow, updates reports/runner-shell-ui-evaluation.md, and creates immediate tickets for concrete out-of-scope defects found during evaluation."
---

# Runner Shell UI Evaluation

Evaluate the runner's pre-game shell as one product surface:

- game selection
- pre-game configuration
- adjacent shell polish on those screens only

Do not evaluate the active game canvas, replay screen, or map editor. If defects in those surfaces are discovered incidentally, record them and create a ticket, but keep scoring focused on the pre-game shell.

## Scope

The evaluation always covers:

- all game cards on the selection screen
- the pre-game configuration screen for every available game
- one desktop viewport and one narrow/mobile viewport
- visual quality and functional product defects that are visible from these screens

The current expected game inspection order is:

1. Fire in the Lake
2. Texas Hold'em

Use desktop first, then mobile.

## Artifacts

- Report file: `reports/runner-shell-ui-evaluation.md`
- Screenshots folder: `screenshots/runner-shell-ui/`
- Out-of-scope defect tickets: `tickets/RUNNERSHELL-###.md`

Create `screenshots/runner-shell-ui/` if it does not exist. It is acceptable to remove stale screenshots from this folder at the start of an evaluation cycle.

Screenshot naming guidance:

- On the first pass, simple base names are fine, for example `selection-desktop.png`.
- On later passes, use iteration-suffixed names such as `selection-desktop-eval2.png` when preserving prior screenshots is useful for before/after comparison.
- If preserving prior screenshots does not add value, clear the old set and reuse the base names instead.

## Checklist

1. Read `docs/FOUNDATIONS.md`.
   Focus on:
   - Foundation 3: visual changes stay in the runner
   - Foundation 9: telemetry and debug surfaces should stay clear and auditable
   - Foundation 15: recommendations should target root causes, not cosmetic patches
2. Read `reports/runner-shell-ui-evaluation.md` if it exists.
   - Read the rubric/header plus the last 2-3 evaluations.
   - If it does not exist, create it during this run using the template below.
3. Verify the runner UI entry points and current game list from:
   - `packages/runner/src/ui/GameSelectionScreen.tsx`
   - `packages/runner/src/ui/PreGameConfigScreen.tsx`
   - `packages/runner/src/bootstrap/bootstrap-registry.ts`
4. Ensure the dev server is available.
   - Reuse an already-running healthy local runner dev server if one is clearly available.
   - Otherwise start `npm run dev` in `packages/runner`.
   - If startup fails because the sandbox cannot bind the local port, immediately retry with escalation. Treat that as an environment constraint, not a product defect.
   - Use the real local app, not component tests, for evaluation.
5. Use browser automation to inspect and capture the screens yourself.
   - Prefer the Codex `playwright` skill or browser automation tools already available in-session.
   - Refresh the browser snapshot after navigation or major view changes before relying on uid-based interactions from prior snapshots.
   - Capture screenshots for:
     - selection screen desktop
     - selection screen mobile
     - each game's config screen desktop
     - each game's config screen mobile
   - Use stable, descriptive filenames.
   - After capture, inspect the actual screenshot images before scoring. Do not score only from DOM or accessibility snapshots.
6. Inspect all game cards on the selection screen.
   Look for:
   - incorrect game facts
   - awkward metadata presentation
   - poor hierarchy or density
   - inconsistent or weak actions
   - layout issues at narrow widths
7. Inspect the config screen for each available game.
   Look for:
   - wrong control choice for the data shape
   - missing guidance about what the controls mean
   - poor grouping or hierarchy
   - weak validation or empty states
   - unnecessary controls for fixed-value games
   - narrow-width layout failures
8. Record concrete functional defects visible from the screens.
   - In-scope defects remain part of the evaluation and recommendations.
   - Concrete out-of-scope defects must create a ticket immediately using `tickets/_TEMPLATE.md`.
   - Use prefix `RUNNERSHELL`.
   - Fill in problem, assumption reassessment, architecture check, files to touch, acceptance criteria, and test plan with repo-specific facts.
9. Determine the next evaluation number from the last `## EVALUATION #N` heading.
10. Append a full evaluation to `reports/runner-shell-ui-evaluation.md`.
11. If you started a temporary dev server for this evaluation, stop it before concluding unless there is a clear reason to leave it running.

## Scoring Dimensions

Score each dimension from 1 to 10.

1. Flow Clarity
   - Can a new user understand what to do next on each screen?
2. Information Architecture
   - Are the right facts surfaced in the right order with good grouping?
3. Control Appropriateness
   - Do controls match the data model and game constraints?
4. Visual Hierarchy and Polish
   - Does the page feel intentional, attractive, and professionally designed?
5. Accessibility and Feedback
   - Contrast, labels, button states, validation clarity, keyboard-friendliness, empty/loading states
6. Responsive Behavior
   - Does the same flow remain usable and legible on the narrow/mobile viewport?

## What to Look For

- generic, bare, or placeholder-looking layout
- weak page hero/title treatment
- cards or forms that feel like raw scaffolding
- metadata formatting bugs such as `4-4` instead of `4`
- sliders used for fixed values
- missing explanation of scenarios, seats, seeds, or controller choices
- poor spacing, alignment, or grouping
- visual imbalance between the primary flow and secondary actions
- weak empty/loading/saved-game states
- regressions from prior evaluations

## Evaluation Template

Append exactly this structure:

```markdown
---

## EVALUATION #N

**Date**: YYYY-MM-DD
**Desktop screenshots**: [comma-separated filenames]
**Mobile screenshots**: [comma-separated filenames]

### Screenshot Analysis

#### [filename]
**View**: [what screen and game this is]
**What's shown**: [1-2 sentences]
**Issues observed**:
- [issue]
- [issue]
[If a screen is substantially successful, these can be residual polish notes rather than defect-shaped findings.]

### Functional Defects Found

- **In scope**: [defect description, or `None.`]
- **Out of scope ticket(s)**: [ticket path(s), or `None.`]
[When applicable, state explicitly that no issue met the threshold for creating a new ticket.]

### Resolved Since Previous

- [issue description] — was [severity] in Eval #M, now fixed.
[If none: `No issues from the previous evaluation were resolved.`]

### Scores

| # | Dimension | Score | Previous | Delta | Justification |
|---|-----------|-------|----------|-------|---------------|
| 1 | Flow Clarity | X | Y | +/-Z | [brief] |
| 2 | Information Architecture | X | Y | +/-Z | [brief] |
| 3 | Control Appropriateness | X | Y | +/-Z | [brief] |
| 4 | Visual Hierarchy and Polish | X | Y | +/-Z | [brief] |
| 5 | Accessibility and Feedback | X | Y | +/-Z | [brief] |
| 6 | Responsive Behavior | X | Y | +/-Z | [brief] |
| | **Average** | **X.X** | **Y.Y** | **+/-Z.Z** | |

### Prioritized Recommendations

1. **[CRITICAL]** [recommendation]
2. **[HIGH]** [recommendation]
3. **[MEDIUM]** [recommendation]
4. **[LOW]** [recommendation]

[Optional when applicable: `**Graduation watch**: The shell is close to acceptable quality; remaining work is refinement-level rather than structural.` Prefer this when the average is roughly 8+ and no remaining issue appears must-fix-now.]
[Optional when applicable: `**Graduated**: The shell is at acceptable quality and no further implementation pass is currently warranted.` Prefer this when the average is high and the remaining observations are genuinely optional rather than actionable.]

### Likely Implementation Targets

- `[path/to/file]` — [concrete defect or improvement target]
[Optional. Include only when likely implementation surfaces are already clear from the evaluation. This is especially useful once the workflow has moved from structural redesign to narrower polish passes. Omit this section when the evaluation concludes that no further implementation pass is warranted.]
```

## Initial Report Header

If `reports/runner-shell-ui-evaluation.md` does not exist, create it with this header before appending the first evaluation:

```markdown
# Runner Shell UI Evaluation

Combined evaluation report for the runner pre-game shell:

- game selection
- pre-game configuration
- adjacent shell polish on those screens only

## Rubric

Dimensions:

1. Flow Clarity
2. Information Architecture
3. Control Appropriateness
4. Visual Hierarchy and Polish
5. Accessibility and Feedback
6. Responsive Behavior

Scoring guide:

- **1-3**: unusable or clearly broken
- **4-5**: functional but weak, confusing, or unprofessional
- **6-7**: solid baseline, still visibly rough
- **8-9**: polished and clear
- **10**: excellent, distinctive, and highly usable
```

On the first run:

- it is normal for the report file to be missing
- it is normal for there to be no prior `RUNNERSHELL-*` tickets
- use `—` for previous and delta score columns
- write `No issues from the previous evaluation were resolved.`

## Ticket Creation Rules

Create an out-of-scope ticket immediately when all are true:

1. the issue is concrete and reproducible
2. it is clearly outside the pre-game shell scope
3. it should not go unnoticed

Use the next available `RUNNERSHELL-###` identifier by checking existing files in `tickets/` and `archive/tickets/`.

Keep those tickets narrow and factual. Do not create speculative tickets.

## Guardrails

- Do not edit application code in this skill.
- Small non-code evaluation maintenance is allowed:
  - creating the report
  - clearing stale evaluation screenshots in the dedicated folder
  - updating screenshot references inside the report
  - creating tickets
- Use real browser capture, not mental inspection of JSX alone.
- Keep evaluation game-agnostic even if only FITL and Texas exist today.
