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

---

## EVALUATION #1

**Date**: 2026-04-03
**Desktop screenshots**: selection-desktop.png, fitl-config-desktop.png, texas-config-desktop.png
**Mobile screenshots**: selection-mobile.png, fitl-config-mobile.png, texas-config-mobile.png

### Screenshot Analysis

#### selection-desktop.png
**View**: Game selection screen, desktop viewport
**What's shown**: The root entry screen lists Fire in the Lake and Texas Hold'em as large click targets, plus a sparse Saved Games section below. Fire in the Lake exposes a secondary Edit Map button outside the card body.
**Issues observed**:
- The page has almost no visual framing beyond a header and two pale rectangles, so it reads like scaffolding rather than a finished product surface.
- `Players: 4-4` is a concrete metadata formatting bug for a fixed-player game.
- The Fire in the Lake `Edit Map` action floats as a disconnected side button instead of reading as a secondary action tied to the card.
- The card content hierarchy is weak: game name, description, and metadata are not differentiated enough to support quick scanning.
- The Saved Games section becomes a large empty expanse with almost no product guidance or next-step framing.

#### selection-mobile.png
**View**: Game selection screen, narrow/mobile viewport
**What's shown**: The same two game cards collapse into a single-column mobile layout with the Edit Map button still separated from the FITL card.
**Issues observed**:
- The mobile layout remains usable, but it inherits the same bare, under-designed presentation as desktop.
- The detached Edit Map button becomes more awkward on mobile because it appears stranded in whitespace instead of inside a cohesive action row.
- The overall page still lacks supporting context, filtering, or meaningful metadata treatment, so the mobile view feels like raw admin tooling rather than a game launcher.

#### fitl-config-desktop.png
**View**: Fire in the Lake pre-game configuration, desktop viewport
**What's shown**: The config page shows a title, raw game id (`fitl`), a fixed player-count slider locked at 4, four seat assignment rows, a seed field, and Start/Back buttons.
**Issues observed**:
- The page header leaks the raw bootstrap/game id instead of a polished product name.
- A slider is the wrong control for a fixed 4-player game and communicates false affordance.
- The screen provides no explanation of scenario, factions, controller strategy, or what starting the game will actually do.
- The form is visually tiny relative to the available canvas, producing a lot of dead whitespace and weak visual focus.
- Seat rows are functional but feel like raw form wiring, with no hierarchy between seat identity and controller choices.

#### fitl-config-mobile.png
**View**: Fire in the Lake pre-game configuration, narrow/mobile viewport
**What's shown**: The same FITL setup flow compresses into stacked rows that remain mostly legible on a phone-sized viewport.
**Issues observed**:
- Mobile remains usable, but the locked player-count slider still wastes prime vertical space on a non-decision.
- The layout has no strong grouping, so the mobile flow reads as a long list of controls rather than a guided setup sequence.
- The seed field occupies substantial space while offering no explanation of why a user would set it.
- Button styling is generic and low-emphasis for the primary start action.

#### texas-config-desktop.png
**View**: Texas Hold'em pre-game configuration, desktop viewport
**What's shown**: The Texas config page shows a raw `texas` identifier, a 2-10 player slider, two seat rows at the current minimum, a seed field, and basic Start/Back buttons.
**Issues observed**:
- The raw game id leaks again instead of a polished title/subtitle treatment.
- Seat naming is confusing at first glance: `Neutral` plus `Player 1` does not clearly explain the table/seat model to a new user.
- The page does not surface any context about blind structure, scenario/default mode, or why the player-count decision matters here.
- The layout still feels mostly uncomposed, with large dead zones and minimal hierarchy.

#### texas-config-mobile.png
**View**: Texas Hold'em pre-game configuration, narrow/mobile viewport
**What's shown**: The Texas setup flow stays narrow and readable with a player-count slider, two seat cards, a seed field, and two buttons.
**Issues observed**:
- The mobile structure is acceptable but still visually austere and under-explained.
- The page lacks progressive disclosure or summary cues, so a new user sees controls without enough meaning.
- Primary/secondary actions are not visually separated enough to make Start feel like the obvious next step.

### Functional Defects Found

- **In scope**: Fixed-player metadata is rendered as `4-4` instead of `4` on the selection screen; FITL exposes a fixed-value player-count slider even though the game is always 4 players; config headers expose raw game ids (`fitl`, `texas`) instead of polished display names; the FITL Edit Map action is visually detached from its owning game card.
- **Out of scope ticket(s)**: None.

### Resolved Since Previous

No issues from the previous evaluation were resolved.

### Scores

| # | Dimension | Score | Previous | Delta | Justification |
|---|-----------|-------|----------|-------|---------------|
| 1 | Flow Clarity | 5 | — | — | The basic sequence is understandable, but the pages provide little guidance, framing, or explanation beyond raw controls. |
| 2 | Information Architecture | 4 | — | — | Important facts are either missing or weakly grouped, and game/setup information is not surfaced in a way that supports confident scanning. |
| 3 | Control Appropriateness | 3 | — | — | The locked FITL slider is a clear control mismatch, and several setup fields appear without enough contextual explanation. |
| 4 | Visual Hierarchy and Polish | 2 | — | — | Both screens look like minimally styled scaffolding rather than a deliberate product surface. |
| 5 | Accessibility and Feedback | 4 | — | — | Labels exist and the forms are operable, but hierarchy, action emphasis, and empty-state communication are weak. |
| 6 | Responsive Behavior | 5 | — | — | The mobile layout does not collapse disastrously, but it inherits the same structural and communication weaknesses as desktop. |
| | **Average** | **3.8** | **—** | **—** | |

### Prioritized Recommendations

1. **[CRITICAL]** Redesign both screens as a cohesive runner shell, with strong page framing, meaningful metadata presentation, clear primary/secondary actions, and shared visual primitives rather than isolated utility styling.
2. **[HIGH]** Fix product-correctness issues in the current shell: render fixed player counts as a single value, replace the FITL fixed player-count slider with a non-editable presentation, and show polished game names instead of raw ids in config headers.
3. **[HIGH]** Rebuild the pre-game configuration flow around clearer information architecture: explicit game summary, grouped setup sections, better seat/controller labeling, and a more purposeful primary action area.
4. **[MEDIUM]** Improve responsiveness and empty/loading states so mobile and sparse states feel intentionally designed rather than merely functional.

---

## EVALUATION #2

**Date**: 2026-04-03
**Desktop screenshots**: selection-desktop-eval2.png, fitl-config-desktop-eval2.png, texas-config-desktop-eval2.png
**Mobile screenshots**: selection-mobile-eval2.png, fitl-config-mobile-eval2.png, texas-config-mobile-eval2.png

### Screenshot Analysis

#### selection-desktop-eval2.png
**View**: Game selection screen, desktop viewport
**What's shown**: The launcher now opens with a framed hero, an `Available Games` panel with integrated metadata/action cards, and a dedicated `Saved Games` panel with a designed empty state.
**Issues observed**:
- The page now feels intentional and productized, with the previous detached FITL map-editor action correctly folded into the card action row.
- Fixed-player metadata is now rendered correctly as `4 players`.
- The Texas card is cleaner after dropping the meaningless `1 faction` badge, but the desktop composition still leaves a lot of empty vertical space in both side-by-side panels.
- The launcher is now clearly a shell, but the copy and metadata remain conservative rather than especially characterful or game-specific.

#### selection-mobile-eval2.png
**View**: Game selection screen, narrow/mobile viewport
**What's shown**: The launcher collapses into stacked cards with strong primary actions, preserved badges, and a dedicated saved-games block below.
**Issues observed**:
- Mobile hierarchy is much stronger than before; actions remain obvious and the FITL secondary action is no longer visually orphaned.
- The card rhythm is good, but the mobile layout still trends slightly tall because the hero and empty-state copy remain generous relative to the amount of actual data.

#### fitl-config-desktop-eval2.png
**View**: Fire in the Lake pre-game configuration, desktop viewport
**What's shown**: FITL now uses a polished game title, summary badges, a static fixed-player card, grouped seat assignment cards, a seed section, and a summary sidebar.
**Issues observed**:
- The fixed-player slider problem is fully resolved; the static `Fixed at 4 players` treatment is much more appropriate.
- The game title and summary now read as product UI rather than internal plumbing.
- Desktop density is improved, but the summary sidebar is still somewhat sparse relative to the width it occupies.
- Seat assignment clarity is much better, although the per-seat controls still read a bit utilitarian compared with the stronger shell framing around them.

#### fitl-config-mobile-eval2.png
**View**: Fire in the Lake pre-game configuration, narrow/mobile viewport
**What's shown**: The FITL setup flow stacks into a coherent mobile sequence with clear sections, preserved seat labels, and a full-width primary action.
**Issues observed**:
- The mobile flow is now guided and readable rather than a raw column of controls.
- The summary block remains useful on mobile, but it pushes the page fairly long; this is acceptable, though still a candidate for future density tuning.

#### texas-config-desktop-eval2.png
**View**: Texas Hold'em pre-game configuration, desktop viewport
**What's shown**: Texas now gets the same shell treatment as FITL, with variable player-count controls retained, cleaner framing, and a summary sidebar.
**Issues observed**:
- The overall information architecture is much clearer than in Eval #1.
- The remaining biggest clarity issue is seat naming: `Neutral` plus `Seat 2` still does not fully explain the table model to a new user.
- The variable-player slider is now contextually justified, but the page still lacks richer game-specific guidance beyond the general shell copy.

#### texas-config-mobile-eval2.png
**View**: Texas Hold'em pre-game configuration, narrow/mobile viewport
**What's shown**: The Texas setup flow remains stable on mobile with grouped controls, a full-width start action, and a stacked summary block.
**Issues observed**:
- The mobile layout is coherent and tappable, with much better sectioning and action emphasis than before.
- The remaining weakness is semantic rather than structural: the seat model is still slightly opaque, especially around `Neutral`.

### Functional Defects Found

- **In scope**: No must-fix-now functional defect remains in the evaluated shell. Remaining gaps are refinement-level UX issues: somewhat sparse desktop density and still-ambiguous Texas seat semantics (`Neutral` / `Seat 2`).
- **Out of scope ticket(s)**: None.

### Resolved Since Previous

- Fixed-player metadata now renders correctly as `4 players` rather than `4-4`.
- The FITL fixed player-count slider was removed and replaced with a non-editable fixed-value presentation.
- Config headers now use polished game display names rather than raw bootstrap ids.
- The FITL `Edit Map` action is now visually integrated into its owning card instead of floating independently.
- Both screens now share a deliberate shell hierarchy with hero framing, grouped sections, stronger action emphasis, and designed empty states.

### Scores

| # | Dimension | Score | Previous | Delta | Justification |
|---|-----------|-------|----------|-------|---------------|
| 1 | Flow Clarity | 8 | 5 | +3 | The launcher and setup screens now clearly communicate next steps, though Texas seat semantics are still not fully self-explanatory. |
| 2 | Information Architecture | 8 | 4 | +4 | Game facts, setup sections, and summary information are now grouped and surfaced coherently across both screens. |
| 3 | Control Appropriateness | 7 | 3 | +4 | The major mismatch is gone with FITL's fixed-player card, but Texas seat naming and model explanation still need refinement. |
| 4 | Visual Hierarchy and Polish | 8 | 2 | +6 | The shell now feels designed and professional rather than placeholder-like, even if some desktop areas remain a bit airy. |
| 5 | Accessibility and Feedback | 7 | 4 | +3 | Labels, action emphasis, and empty-state communication improved materially, but some text remains small/light and the semantic model could still be clearer. |
| 6 | Responsive Behavior | 8 | 5 | +3 | Mobile is now coherent and guided across the whole flow, with only moderate page-length/density tradeoffs remaining. |
| | **Average** | **7.7** | **3.8** | **+3.9** | |

### Prioritized Recommendations

1. **[HIGH]** Clarify Texas seat semantics so first-time users understand why one seat is `Neutral` and how the remaining seats map onto the table.
2. **[MEDIUM]** Tighten desktop density, especially in the selection-shell side panels and config summary sidebars, so the layouts feel less airy without losing their calmer structure.
3. **[MEDIUM]** Add a bit more game-specific guidance or payoff language in the config hero/summary areas so the shell feels not just polished, but more meaningful for each title.
4. **[LOW]** Refine typography and secondary-text contrast slightly for small explanatory copy, especially in dense desktop sections.

### Likely Implementation Targets

- `packages/runner/src/ui/PreGameConfigScreen.tsx` — clarify Texas seat naming and short explanatory copy for the table model.
- `packages/runner/src/ui/GameSelectionScreen.module.css` — tighten desktop panel/card density and reduce unused whitespace.
- `packages/runner/src/ui/PreGameConfigScreen.module.css` — tune summary-panel density and small-text emphasis.

---

## EVALUATION #3

**Date**: 2026-04-03
**Desktop screenshots**: selection-desktop-eval3.png, fitl-config-desktop-eval3.png, texas-config-desktop-eval3.png
**Mobile screenshots**: selection-mobile-eval3.png, fitl-config-mobile-eval3.png, texas-config-mobile-eval3.png

### Screenshot Analysis

#### selection-desktop-eval3.png
**View**: Game selection screen, desktop viewport
**What's shown**: The launcher keeps the same framed two-panel shell, but the cards, side panels, and saved-game empty state now sit a bit tighter inside the desktop layout.
**Issues observed**:
- The shell reads as clearly professional now, with strong card scanning, stable action hierarchy, and no obvious metadata or action-placement bug remaining.
- The one remaining visual weakness is that the hero band still occupies a generous amount of vertical space before the actual library begins, so desktop still feels slightly calmer than necessary rather than especially information-dense.

#### selection-mobile-eval3.png
**View**: Game selection screen, narrow/mobile viewport
**What's shown**: The mobile launcher stacks the hero, game cards, and saved-games panel into a coherent single-column flow with full-width actions.
**Issues observed**:
- Mobile remains clear and polished, with no functional ambiguity around which action starts setup and which one opens the FITL map editor.
- The flow is still slightly tall, but the current spacing now feels intentional rather than wasteful.

#### fitl-config-desktop-eval3.png
**View**: Fire in the Lake pre-game configuration, desktop viewport
**What's shown**: FITL presents a fixed-player setup shell with denser section spacing, a full-table explanation, grouped seat cards, and a more compact summary sidebar.
**Issues observed**:
- The desktop composition is stronger than in Eval #2; the summary panel no longer feels conspicuously underfilled relative to its width.
- The remaining limitation is thematic rather than structural: the copy is polished and helpful, but still fairly generic instead of feeling deeply tuned to each title.

#### fitl-config-mobile-eval3.png
**View**: Fire in the Lake pre-game configuration, narrow/mobile viewport
**What's shown**: The FITL setup flow stacks cleanly with preserved sectioning, seat identity, fixed-player messaging, and a readable summary block below the form.
**Issues observed**:
- Mobile usability is solid, with clear section progression and strong primary-action emphasis.
- The page remains long because the full summary is still shown inline, but the current result is acceptable and not a usability problem.

#### texas-config-desktop-eval3.png
**View**: Texas Hold'em pre-game configuration, desktop viewport
**What's shown**: Texas uses the same shell treatment as FITL, now with an explicit note that named seats come from metadata and the remaining positions are generic table seats.
**Issues observed**:
- The biggest semantic problem from Eval #2 is resolved: `Neutral` and `Seat 2` now read as part of an explained seat model instead of a confusing naming accident.
- The remaining room for improvement is mostly editorial: the slider, summary, and table guidance are understandable, but the page could still become more game-specific or flavorful in a future pass.

#### texas-config-mobile-eval3.png
**View**: Texas Hold'em pre-game configuration, narrow/mobile viewport
**What's shown**: The Texas mobile setup keeps the explanatory seat-model note, grouped seat cards, variable player-count control, and stacked summary block in a stable narrow layout.
**Issues observed**:
- The seat model now reads clearly even on mobile, which resolves the main prior ambiguity.
- Small supporting text is improved, though still slightly quiet compared with the stronger headline and button treatments.

### Functional Defects Found

- **In scope**: No must-fix-now functional defect remains in the evaluated shell. Remaining gaps are polish-level: slightly generous desktop hero spacing and still-conservative, mostly generic supporting copy.
- **Out of scope ticket(s)**: None.

### Resolved Since Previous

- Texas seat semantics are now explicitly explained through mixed named/generic seat guidance instead of leaving `Neutral` and `Seat 2` ambiguous.
- Desktop density improved across the selection shell and config summary panels, reducing the airy feel called out in Eval #2.
- Supporting copy and contrast are a bit stronger in dense desktop sections, especially around seat-model and summary guidance.

### Scores

| # | Dimension | Score | Previous | Delta | Justification |
|---|-----------|-------|----------|-------|---------------|
| 1 | Flow Clarity | 9 | 8 | +1 | The pre-game flow is now easy to follow across both titles, and the last major semantic confusion on Texas setup is gone. |
| 2 | Information Architecture | 9 | 8 | +1 | The shell now exposes the right facts in the right places with very little leftover structural confusion. |
| 3 | Control Appropriateness | 8 | 7 | +1 | Controls now match the data model cleanly across both games; the remaining limitations are more about copy depth than control choice. |
| 4 | Visual Hierarchy and Polish | 8 | 8 | +0 | The shell remains polished and intentional, though the selection hero still spends a bit more vertical space than the content strictly needs. |
| 5 | Accessibility and Feedback | 8 | 7 | +1 | Labels, seat-model explanation, action emphasis, and secondary text treatment are all stronger, with no obvious feedback gap left on these screens. |
| 6 | Responsive Behavior | 8 | 8 | +0 | Mobile remains coherent and usable throughout, with only benign page-length tradeoffs in the stacked config summaries. |
| | **Average** | **8.3** | **7.7** | **+0.6** | |

### Prioritized Recommendations

1. **[MEDIUM]** Tighten the desktop hero/header vertical rhythm slightly on the selection screen so content reaches the fold sooner without losing the current calm visual tone.
2. **[MEDIUM]** Add a little more title-specific payoff or context copy in the config shells so the pages feel not just clear, but more distinctive to each game.
3. **[LOW]** Continue tuning small supporting text contrast and density in long-form mobile summaries if another polish pass is warranted.
4. **[LOW]** Consider whether the saved-games panel should eventually earn richer empty-state guidance or small preview metadata once that feature area becomes more active.

**Graduation watch**: The shell is close to acceptable quality; remaining work is refinement-level rather than structural.

### Likely Implementation Targets

- `packages/runner/src/ui/GameSelectionScreen.module.css` — trim hero-to-library spacing on desktop without flattening the overall shell.
- `packages/runner/src/ui/PreGameConfigScreen.tsx` — add slightly more game-specific payoff language if a final editorial polish pass is desired.

---

## EVALUATION #4

**Date**: 2026-04-03
**Desktop screenshots**: selection-desktop-eval4.png, fitl-config-desktop-eval4.png, texas-config-desktop-eval4.png
**Mobile screenshots**: selection-mobile-eval4.png, fitl-config-mobile-eval4.png, texas-config-mobile-eval4.png

### Screenshot Analysis

#### selection-desktop-eval4.png
**View**: Game selection screen, desktop viewport
**What's shown**: The launcher now uses the hero area more intentionally, with compact shell-status badges above a tighter two-panel library and saved-games layout.
**Issues observed**:
- The desktop hero no longer feels over-generous; content reaches the library quickly while still preserving the calmer shell framing.
- Residual polish only: the launcher remains deliberately restrained rather than especially expressive, but it now reads as a complete product surface rather than an in-progress shell.

#### selection-mobile-eval4.png
**View**: Game selection screen, narrow/mobile viewport
**What's shown**: The mobile launcher preserves the new hero facts, stacked game cards, and saved-games panel in a dense but readable column.
**Issues observed**:
- Mobile is clear and cohesive, with no obvious scan, action, or metadata problem left.
- Residual polish only: the full shell still trends a little long, but the density now feels proportional to the information shown.

#### fitl-config-desktop-eval4.png
**View**: Fire in the Lake pre-game configuration, desktop viewport
**What's shown**: FITL now opens with a clear title, payoff line, fixed-player summary, grouped seat controls, and a compact next-step sidebar.
**Issues observed**:
- The config shell now feels specific to a full-table asymmetric game instead of generic pre-game scaffolding.
- Residual polish only: the experience is strong enough that further work would mostly be optional stylistic refinement, not usability repair.

#### fitl-config-mobile-eval4.png
**View**: Fire in the Lake pre-game configuration, narrow/mobile viewport
**What's shown**: The FITL mobile setup keeps the payoff copy, fixed-player treatment, stacked seat controls, and inline summary readable all the way down the page.
**Issues observed**:
- The mobile sequence remains understandable and tappable with no misleading control or copy choice.
- Residual polish only: the long-form layout is acceptable and no longer feels like a design weakness.

#### texas-config-desktop-eval4.png
**View**: Texas Hold'em pre-game configuration, desktop viewport
**What's shown**: Texas now pairs the mixed named/generic seat explanation with a title-shaped payoff line that makes the flexible table model feel intentional rather than merely valid.
**Issues observed**:
- The last medium-priority editorial gap from Eval #3 is now resolved; the page feels specific to this table shape instead of sharing only generic shell wording.
- Residual polish only: additional flavor text could still be invented later, but nothing currently feels missing.

#### texas-config-mobile-eval4.png
**View**: Texas Hold'em pre-game configuration, narrow/mobile viewport
**What's shown**: The mobile Texas flow preserves the payoff line, player-count control, mixed-seat explanation, and summary block in a stable narrow layout.
**Issues observed**:
- The previously tricky seat-model story remains clear even on mobile, and the added payoff line improves context without crowding the layout.
- Residual polish only: small text is now quiet in a controlled way rather than under-emphasized.

### Functional Defects Found

- **In scope**: None.
- **Out of scope ticket(s)**: None.

### Resolved Since Previous

- The selection-shell desktop hero rhythm is now tighter and more intentional through compact hero facts and denser top-of-page spacing.
- The config shells now carry more title-shaped payoff language, so FITL and Texas no longer feel like the same generic setup container with different metadata.
- The remaining Eval #3 browser targets were rechecked in this pass and now appear resolved in both desktop and mobile layouts.

### Scores

| # | Dimension | Score | Previous | Delta | Justification |
|---|-----------|-------|----------|-------|---------------|
| 1 | Flow Clarity | 9 | 9 | +0 | The full pre-game flow is straightforward across both titles, with no visible ambiguity left in setup actions or page purpose. |
| 2 | Information Architecture | 9 | 9 | +0 | The right facts are surfaced in the right order and now carry enough title-specific framing to feel complete. |
| 3 | Control Appropriateness | 9 | 8 | +1 | Controls and explanatory copy now align cleanly with both the fixed-seat and flexible-seat game shapes. |
| 4 | Visual Hierarchy and Polish | 9 | 8 | +1 | The shell now feels complete and intentional on both desktop and mobile, with the last visible spacing imbalance resolved. |
| 5 | Accessibility and Feedback | 8 | 8 | +0 | Labels, hierarchy, and feedback remain solid, with no new clarity or contrast concern visible on these screens. |
| 6 | Responsive Behavior | 9 | 8 | +1 | The mobile views now feel fully deliberate rather than merely acceptable adaptations of the desktop shell. |
| | **Average** | **8.8** | **8.3** | **+0.5** | |

### Prioritized Recommendations

1. **[LOW]** Leave the shell as-is unless a new product requirement emerges; remaining opportunities are optional brand-expression polish rather than clear UX debt.
2. **[LOW]** When saved-game usage grows, consider enriching that panel with lightweight preview metadata or categorization rather than changing the core launcher structure.
3. **[LOW]** If a future pass wants stronger personality, explore title-specific visual accents cautiously without losing the current clarity and reusability.
4. **[LOW]** No additional pre-game shell implementation pass is warranted based on the current evidence.

**Graduation watch**: The shell is at acceptable quality; remaining work is optional refinement rather than a meaningful implementation gap.
