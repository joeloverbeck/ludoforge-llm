# Action Tooltip Plan — Iteration 2

**Date**: 2026-04-04
**Based on**: EVALUATION #1 (average score: 3.0)
**Problems targeted**: CRITICAL #3 (kebab-case capability IDs), HIGH #5 (magic numbers), HIGH #4 (repetitive step headers)

## Context

Baseline evaluation scored 3.0/10 — tooltips are in the "unusable" range. Three CRITICAL and two HIGH issues were identified. This first implementation iteration targets the three most feasible fixes that collectively impact 6 of 8 metrics. The two hardest CRITICALs (#1 filter predicates, #2 $variables) are deferred — they require deeper investigation of the filter AST and binding resolution pipelines.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Humanize filter predicates (CRITICAL #1) | Eval #1 | Iteration 2 | Iteration 3 |
| Remove raw $variable references (CRITICAL #2) | Eval #1 | Iteration 2 | Iteration 3 |
| Add visual hierarchy via CSS (MEDIUM #6) | Eval #1 | Iteration 2 | no target yet |
| Progressive disclosure for long tooltips (MEDIUM #7) | Eval #1 | Iteration 2 | no target yet |
| Cost transparency improvements (MEDIUM #8) | Eval #1 | Iteration 2 | no target yet |
| Optional/mandatory distinction (LOW #9) | Eval #1 | Iteration 2 | no target yet |

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Always relevant | All fixes are game-agnostic — humanizeIdentifier works on any string, magic number normalization uses no game-specific constants, header diversification is based on generic message metadata |
| #3 Visual Separation | Always relevant | No runner/presentation changes this iteration — all fixes are in the engine tooltip pipeline |
| #5 One Rules Protocol | Not relevant | RuleCard interface is unchanged — only the text content of existing fields changes |
| #10 Architectural Completeness | Always relevant | Each fix addresses root cause: humanizer not applied to capability IDs, planner not normalizing sentinel bounds, planner using single kind→header map |
| #14 No Backwards Compat | Not relevant | No interface changes — only behavioral changes in text generation |

## Layer Triage

| Problem | Layer | Reasoning |
|---------|-------|-----------|
| Kebab-case capability IDs ("Cap-assault-cobras-shaded-cost") | Engine | Data quality: modifier condition strings and inline capability references are not routed through humanizeIdentifier before being emitted in RuleCard text |
| Magic numbers ("Select up to 99", "Select 1-0", "Select 0") | Engine | Data quality: content planner passes raw min/max bounds to the realizer without normalizing sentinel values (99→unlimited, 0→omit, inverted ranges) |
| Repetitive "Select spaces" headers | Engine | Data quality: content planner maps message kind→header via SUB_STEP_HEADER_BY_KIND, but consecutive messages of the same kind produce identical headers |

## Current Code Architecture (reference for implementer)

### Magic number sentinels

`tooltip-template-realizer.ts` line ~95-109: `realizeSelect()` receives `msg.min` and `msg.max` from the TooltipMessage. These come from the compiler's action bounds and are raw integers. `99` and `999` are sentinel values meaning "unlimited". `0` means "zero items required" (which should either be suppressed or reworded). Inverted ranges like `1-0` occur when max < min.

The realizer formats bounds as:
- `"Select N"` when min === max
- `"Select N-M"` when min < max
- `"Select up to M"` when min === 0

No sentinel detection exists.

### Kebab-case capability IDs

Two leak paths:

1. **Modifier conditions** (`tooltip-template-realizer.ts` line ~233-240): `realizeModifier()` receives pre-stringified `msg.condition` and `msg.description` strings. These are already humanized by `resolveModifierEffect()` in `tooltip-modifier-humanizer.ts` — but only when `modifierEffects` entries exist in the game's verbalization data. When no pre-authored text exists, the fallback is `humanizeCondition()` which handles the ConditionAST but NOT kebab-case inline strings.

2. **Inline capability references** in step lines: These appear as raw strings in realized lines (e.g., `"Cap-assault-cobras-shaded-cost"`) when the message's content includes capability identifiers that aren't routed through any humanization.

The existing `humanizeIdentifier()` in `tooltip-humanizer.ts` already handles kebab-case splitting and title-casing. The issue is that capability ID strings bypass this function.

### Step header generation

`tooltip-content-planner.ts` line ~185-195: `deriveSubStepHeader()` maps message kind → header via `SUB_STEP_HEADER_BY_KIND` constant. When consecutive sub-steps have the same kind (e.g., 6 `select` messages), they all get "Select spaces" as the header. The function has a secondary path: if the first message is `kind === 'summary'` with a `macroClass`, the macroClass is used — but this can also leak raw identifiers.

The message objects carry metadata that could diversify headers:
- `msg.target` — what is being selected (e.g., "spaces", "pieces", "zone")
- `msg.role` — the message's role in the action pipeline (e.g., "targetSpaces", "filter")
- `msg.filter` — the filter string (e.g., "Category is Line of Communication")
- `msg.kind` — the message kind (select, place, move, etc.)

## Problem 1: Kebab-case capability IDs exposed in tooltip text

**Evaluation score**: Terminology Consistency = 2/10
**Root cause**: Capability ID strings (e.g., "Cap-assault-cobras-shaded-cost") appear in RuleCard text because they are rendered as inline content in realized lines without humanization. The modifier humanizer handles ConditionAST but not these inline string references.
**Layer**: Engine

### Approaches Considered

1. **Post-process all realized lines through humanizeIdentifier**: After `realizeMessage()` produces text, scan for kebab-case patterns and humanize them.
   - Feasibility: MEDIUM — requires regex detection of kebab-case tokens in arbitrary text
   - Readability impact: HIGH — catches all leak paths
   - Risk: Could over-humanize intentional kebab-case in legitimate text (unlikely in tooltip context)
   - Foundation alignment: Game-agnostic regex, no concerns

2. **Suppress lines containing only capability IDs**: If a realized line's text matches a capability ID pattern (`/^[A-Z][a-z]+-[a-z]+-/` or similar), suppress the entire line.
   - Feasibility: HIGH — simple pattern match and filter
   - Readability impact: MEDIUM — removes jargon but also removes the information
   - Risk: Loses potentially useful information about what capabilities are active

3. **Add a dedicated capability ID humanization step in the content planner**: Before messages are realized, scan for capability IDs in message content fields and either resolve them via verbalization labels or humanize via `humanizeIdentifier()`.
   - Feasibility: MEDIUM — requires identifying which message fields contain capability IDs
   - Readability impact: HIGH — humanized at the source
   - Risk: LOW — only transforms identified capability ID fields

### Recommendation: Approach 3 (source-level humanization) with Approach 2 as fallback

**Why**: Humanizing at the source preserves information (the player sees "Cobras Shaded Cost" instead of nothing). For any remaining leaks, a post-realization scan (simplified Approach 1) catches stragglers. Approach 2's suppression is too aggressive.

## Problem 2: Magic numbers in select bounds

**Evaluation score**: Language Naturalness = 2/10, Step Semantic Clarity = 3/10
**Root cause**: The realizer formats raw min/max bounds without detecting sentinel values. `99`/`999` should mean "unlimited", `0` in min position should be suppressed, and inverted ranges (max < min) should be handled gracefully.
**Layer**: Engine

### Approaches Considered

1. **Normalize bounds in the content planner before realization**: Add a pre-processing step that transforms sentinel bounds in TooltipMessage objects before they reach the realizer.
   - Feasibility: HIGH — centralized, single location
   - Readability impact: HIGH — "Select up to 99" → "Select any number of"
   - Risk: LOW — sentinel detection is straightforward (values ≥ 99 or ≥ 999)
   - Foundation alignment: No concerns

2. **Normalize bounds in the realizer's formatting logic**: Modify `realizeSelect()` to detect sentinels when formatting the bounds string.
   - Feasibility: HIGH — localized change in one function
   - Readability impact: HIGH — same as approach 1
   - Risk: LOW — same sentinel detection
   - Foundation alignment: No concerns

3. **Suppress bounds entirely for sentinel values**: When max ≥ 99, omit the count entirely (just "Select spaces" instead of "Select up to 99 spaces").
   - Feasibility: HIGH — simplest
   - Readability impact: MEDIUM — removes confusing numbers but also removes useful "up to" phrasing
   - Risk: LOW — just omission

### Recommendation: Approach 2 (realizer-level normalization)

**Why**: The realizer is where formatting happens — it's the natural place to format bounds intelligently. Approach 1 would require the planner to know about presentation, which is the realizer's job. Specific normalizations:
- `max ≥ 99` → omit upper bound or use "any number of"
- `min === 0 && max === 0` → suppress the line entirely (zero-item selections are no-ops)
- `min > max` (inverted) → treat as `min` (single value)
- `min === 0 && max > 0 && max < 99` → "Select up to {max}"

## Problem 3: Repetitive "Select spaces" step headers

**Evaluation score**: Step Semantic Clarity = 3/10
**Root cause**: `deriveSubStepHeader()` uses a static kind→header map. All `select` messages get "Select spaces" regardless of what they're selecting or why.
**Layer**: Engine

### Approaches Considered

1. **Use message target to diversify headers**: Instead of `SUB_STEP_HEADER_BY_KIND['select']` → "Select spaces", use `"Select " + humanizeIdentifier(msg.target)` to produce "Select Target Spaces", "Select Forces", etc.
   - Feasibility: HIGH — `msg.target` is already available
   - Readability impact: MEDIUM — better than "Select spaces" x7 but still generic
   - Risk: LOW — if target is undefined, fall back to current behavior
   - Foundation alignment: Game-agnostic (uses generic target metadata)

2. **Use message role/context to generate contextual headers**: Inspect `msg.role`, `msg.filter`, or position in the action pipeline to generate headers like "Choose target provinces", "Select forces to move".
   - Feasibility: MEDIUM — requires understanding role semantics
   - Readability impact: HIGH — truly descriptive headers
   - Risk: MEDIUM — role semantics may not always produce good headers
   - Foundation alignment: Must remain game-agnostic

3. **Collapse consecutive same-header sub-steps**: Instead of showing 6 "Select spaces" sub-steps, merge them into a single "Select spaces" step with combined content.
   - Feasibility: MEDIUM — requires merging logic in the planner
   - Readability impact: MEDIUM — reduces repetition but loses step-by-step structure
   - Risk: MEDIUM — could collapse steps that should be separate

### Recommendation: Approach 1 (target-based diversification)

**Why**: Simplest, lowest risk, and produces immediate improvement. The target field is always present on select messages and provides meaningful differentiation. Can be enhanced with Approach 2 in future iterations. Specific implementation:
- Use `humanizeIdentifier(msg.target)` when `msg.target` is not "spaces" or generic
- For `msg.kind !== 'select'`, keep current `SUB_STEP_HEADER_BY_KIND` mapping (already diverse)
- For duplicate consecutive headers, append a sequence number: "Select Spaces (1)", "Select Spaces (2)"

## Implementation Steps

1. **Normalize magic number bounds in realizeSelect()** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - Add sentinel detection at the top of `realizeSelect()`:
     - `max >= 99` → treat as unlimited (omit upper bound)
     - `min === 0 && max === 0` → suppress line (return empty/null)
     - `min > max` → use `min` as single value
   - Update bounds formatting to produce:
     - "Select any number of {target}" when unlimited
     - "Select up to {N} {target}" when bounded
     - "Select {N} {target}" when exact

2. **Diversify step headers using message target** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-content-planner.ts` — **Depends on**: none
   - Modify `deriveSubStepHeader()` to use `msg.target` when available:
     - If `msg.kind === 'select'` and `msg.target` is not generic ("spaces", "items"), use `"Select " + humanizeIdentifier(msg.target)`
     - For other kinds, keep current `SUB_STEP_HEADER_BY_KIND` mapping
   - Add deduplication: if consecutive sub-steps would get the same header, append context from `msg.filter` or `msg.role` to differentiate

3. **Humanize capability ID strings in modifier and inline content** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - In `realizeModifier()`: route `msg.condition` and `msg.description` through `humanizeIdentifier()` when they match kebab-case patterns (`/^[A-Za-z]+-[a-z]+-/`)
   - Add a post-realization pass: scan all `RealizedLine.text` values for kebab-case tokens and humanize them via `humanizeIdentifier()`

4. **Update engine tooltip tests** — **Layer**: Engine — **File**: `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts`, `tooltip-content-planner.test.ts` — **Depends on**: Steps 1, 2, 3
   - Update golden assertions in `tooltip-template-realizer.test.ts` for changed bounds formatting
   - Update golden assertions in `tooltip-content-planner.test.ts` for changed step headers
   - Add new test cases for sentinel detection and kebab-case humanization

5. **Update integration tests** — **Layer**: Engine — **File**: `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`, `tooltip-cross-game-properties.test.ts` — **Depends on**: Steps 1, 2, 3
   - Update end-to-end golden assertions that match on step headers, bounds text, or modifier strings

## Verification

1. `pnpm turbo typecheck` — must pass (both packages)
2. `pnpm -F @ludoforge/engine test` — must pass
3. `pnpm -F @ludoforge/runner test` — must pass
4. Visual check: run `pnpm -F @ludoforge/runner dev`, hover over each action button, verify:
   - No "99" or "1-99" magic numbers in bounds
   - No "Select 0" lines
   - Step headers more diverse than "Select spaces" x7
   - No kebab-case capability IDs (Cap-*, Sweep-loc-hop, Place-from-available-or-map)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Over-humanization of kebab-case strings that should stay as-is | LOW | Tooltip text has unexpected formatting | Limit regex to known capability ID patterns; add tests for edge cases |
| Sentinel threshold too aggressive (some games use 99 as a real bound) | LOW | Real bounds treated as unlimited | Use ≥99 threshold; if games need higher real bounds, increase threshold |
| Step header diversification produces awkward text from generic targets | MEDIUM | Headers like "Select Items" instead of useful descriptions | Fall back to current "Select spaces" when target is too generic; improve in future iteration |
| Integration test churn | HIGH | Many golden assertions need updating | Pre-flight grep for affected patterns; update systematically |

## Implementation Verification Checklist

- [ ] `tooltip-template-realizer.ts`: `realizeSelect()` detects `max >= 99` and omits upper bound
- [ ] `tooltip-template-realizer.ts`: `realizeSelect()` suppresses `min === 0 && max === 0` lines
- [ ] `tooltip-template-realizer.ts`: `realizeSelect()` handles `min > max` gracefully
- [ ] `tooltip-content-planner.ts`: `deriveSubStepHeader()` uses `msg.target` for select messages
- [ ] `tooltip-template-realizer.ts`: `realizeModifier()` humanizes kebab-case condition/description strings
- [ ] `tooltip-template-realizer.ts`: Post-realization pass humanizes remaining kebab-case tokens in line text
- [ ] All engine unit tests pass
- [ ] All engine integration tests pass

## Test Impact

- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — bounds formatting assertions, modifier rendering assertions
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — step header assertions
- `packages/engine/test/unit/kernel/tooltip-humanizer.test.ts` — may need new kebab-case test cases
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — end-to-end golden assertions
- `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` — cross-game golden assertions
- `packages/engine/test/unit/tooltip-humanization.test.ts` — humanization integration tests

## Research Sources

- No external research needed — all solutions extend existing patterns in the codebase (humanizeIdentifier, realizeSelect bounds formatting, deriveSubStepHeader)
