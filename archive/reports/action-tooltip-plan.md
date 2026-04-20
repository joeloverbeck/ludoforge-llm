# Action Tooltip Plan — Iteration 8

**Status**: COMPLETED

**Date**: 2026-04-04
**Based on**: EVALUATION #7 (average score: 5.8)
**Problems targeted**: MEDIUM #1 ("Place From Available Or Map" noise), MEDIUM #2 (arithmetic expressions visible), MEDIUM #3 ("Sub Space" jargon)

## Context

No HIGH or CRITICAL recommendations remain after 7 iterations (3.0 → 5.8). This is a polishing iteration addressing the 3 simplest remaining MEDIUMs — all are single-line post-realization cleanup in the engine. Arithmetic expressions ("Transfer Amount * -1", "1 * -4 or -3") are the most impactful remaining issue, affecting Language Naturalness which is at 7 but could reach 8. "Place From Available Or Map" is the single remaining noise identifier. "Sub Space" is a one-word jargon fix. Together these should push the average toward 6.0-6.5.

## Deferred Items

| Item | First recommended | Deferred since | Target iteration |
|------|-------------------|---------------|-----------------|
| Optional/mandatory distinction | Eval #1 | Iteration 2 | Iteration 9 (requires RuleCard interface change) |
| Consecutive identical step headers | Eval #4 | Iteration 7 | no target yet |

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | Always relevant | All regex patterns are generic (arithmetic operators, specific identifier) |
| #3 Visual Separation | Always relevant | No runner changes this iteration |
| #5 One Rules Protocol | Not relevant | RuleCard interface unchanged |
| #10 Architectural Completeness | Always relevant | Post-realization cleanup is pragmatic polishing — root causes (normalizer pre-stringification) were addressed as far as feasible in iterations 3-5 |
| #14 No Backwards Compat | Not relevant | No interface changes |

## Layer Triage

| Problem | Layer | Reasoning |
|---------|-------|-----------|
| Arithmetic expressions ("Transfer Amount * -1") | Engine | Data quality: arithmetic expressions leak from pre-stringified value expressions. Suppressing or simplifying them in the post-realization pass is the pragmatic fix. |
| "Place From Available Or Map" noise | Engine | Data quality: a summary-kind message producing a humanized macro identifier. The current noise pattern requires all Title Case words — this has mixed case ("From", "Or"). Needs pattern broadening. |
| "Sub Space" jargon | Engine | Data quality: internal zone naming convention leaking through. A simple string replacement in post-realization handles this. |

## Current Code Architecture (reference for implementer)

### Post-realization pass in realizeStep()

`tooltip-template-realizer.ts` ~line 405-415:
```
const cleaned = simplifyConditionText(humanizeKebabTokens(humanizeDollarVars(raw)));
if (cleaned.length > 0 && !isNoiseLine(cleaned)) {
  lines.push({ text: cleaned, astPath: m.astPath });
}
```

All 3 fixes compose into this existing pipeline:
1. Arithmetic: add to `simplifyConditionText()` or new function
2. "Place From Available Or Map": extend `isNoiseLine()` pattern
3. "Sub Space": add to `simplifyConditionText()`

### Arithmetic expressions in step lines

From screenshots: "Set Patronage to Transfer Amount * -1", "Set ARVN Resources to 1 * -4 or -3", "Pac Levels * -4 or -3". These are pre-stringified `ValueExpr` arithmetic that survived through the pipeline. The player doesn't need to see the math — the action description should say what changes, not the formula.

### "Place From Available Or Map"

This is a `realizeSummary()` output from a summary-kind message with `macroClass` set to a humanized macro identifier. The `isNoiseLine()` pattern requires 3+ Title Case words with no lowercase words — "From" and "Or" are capitalized by `humanizeIdentifier` but appear as common English prepositions/conjunctions, making the pattern ambiguous.

## Problem 1: Arithmetic expressions visible to players

**Evaluation score**: Language Naturalness = 7/10 (would improve), Terminology Consistency = 6/10
**Root cause**: Pre-stringified `ValueExpr` arithmetic expressions survive into realized text. Lines like "Transfer Amount * -1" and "1 * -4 or -3" show raw computation.
**Layer**: Engine

### Approaches Considered

1. **Suppress lines containing arithmetic operators**: In the post-realization pass, detect lines containing ` * `, ` + `, ` - ` (with spaces, to avoid matching hyphenated words) and suppress the entire line.
   - Feasibility: HIGH — simple regex
   - Readability impact: MEDIUM — removes confusing content but also removes context about what changes
   - Risk: MEDIUM — could suppress legitimate "Shift +2" type lines
   - Foundation alignment: No concerns

2. **Replace arithmetic with descriptive text**: Transform "Set X to Y * -1" → "Reduce X" or "Negate X", "Set X to 1 * -4 or -3" → "Adjust X".
   - Feasibility: LOW — requires understanding the semantic meaning of the arithmetic
   - Readability impact: HIGH — descriptive text
   - Risk: HIGH — semantic inference is fragile

3. **Strip arithmetic portions, keep the variable name**: Transform "Set Patronage to Transfer Amount * -1" → "Set Patronage to Transfer Amount" (drop the operator and right operand).
   - Feasibility: HIGH — regex to strip ` * -?\d+` and ` or -?\d+` suffixes
   - Readability impact: MEDIUM — keeps context about what changes, removes the confusing math
   - Risk: LOW — only strips trailing arithmetic, doesn't change the core meaning

### Recommendation: Approach 3 (strip arithmetic, keep variable name)

**Why**: Preserves the information about what is changing (Patronage, Resources) while removing the confusing computation. "Set Patronage to Transfer Amount" is understandable — the player knows Patronage changes based on the transfer. "1 * -4 or -3" is pure noise and should be stripped entirely.

## Problem 2: "Place From Available Or Map" noise

**Evaluation score**: Terminology Consistency = 6/10
**Root cause**: `isNoiseLine()` requires 3+ consecutive Title Case words starting with uppercase. "Place From Available Or Map" has 5 words all Title Case — but "Place" is also an ACTION_STARTS verb. The pattern checks ACTION_STARTS first and doesn't suppress lines starting with action verbs.
**Layer**: Engine

### Approaches Considered

1. **Add specific exception for summary-kind messages**: In `realizeStep()`, check `m.kind === 'summary'` and suppress if the text is a pure identifier (no numbers, operators, or verbs after the first word).
   - Feasibility: HIGH — kind-aware suppression
   - Readability impact: MEDIUM — removes 1 noise line
   - Risk: LOW — only affects summary messages

2. **Broaden isNoiseLine() to handle action-verb-prefixed identifiers**: When a line starts with an action verb but the REST of the line is all Title Case with no numbers or operators, suppress it.
   - Feasibility: MEDIUM — more complex regex
   - Readability impact: MEDIUM — removes identifier-only lines even when they start with action verbs
   - Risk: MEDIUM — could suppress legitimate "Place Troops in Zone" type lines

3. **Hardcode suppression of specific known macro identifiers**: Check for exact matches against a small set of known noise strings.
   - Feasibility: HIGH — simple set check
   - Readability impact: LOW — only catches known strings, fragile for new games
   - Risk: LOW — no false positives
   - Foundation alignment: Borderline F#1 — hardcoded strings are specific but generic in form

### Recommendation: Approach 1 (summary-kind suppression)

**Why**: Summary messages are identified by their `kind` field. When a summary message produces text that is purely an identifier (no useful player content), suppressing it is correct regardless of what the identifier says. This is a kind-aware check in `realizeStep()`, not a fragile regex.

## Problem 3: "Sub Space" jargon

**Evaluation score**: Terminology Consistency = 6/10
**Root cause**: Internal zone naming convention uses "Sub Space" for sub-zones. This leaks through the realizer.
**Layer**: Engine

### Approaches Considered

1. **Add "Sub Space" → "sub-zone" replacement to simplifyConditionText()**: Simple string replacement.
   - Feasibility: HIGH — 1 line
   - Readability impact: LOW — marginal improvement, "sub-zone" is still somewhat jargon-y
   - Risk: LOW — specific string match

2. **Replace "Sub Space" → "this space"**: More natural phrasing.
   - Feasibility: HIGH — 1 line
   - Readability impact: MEDIUM — "Remove Cube from this space" is natural
   - Risk: LOW — specific string match

3. **Suppress the entire "Remove Cube from Sub Space to..." line**: The removal action is internal bookkeeping, not a player-facing instruction.
   - Feasibility: HIGH — pattern match
   - Readability impact: MEDIUM — removes confusing line entirely
   - Risk: MEDIUM — player loses information about token movement

### Recommendation: Approach 2 ("Sub Space" → "this space")

**Why**: "Remove Cube from this space to Available Forces" is natural and preserves the information. Simple 1-line replacement.

## Implementation Steps

1. **Strip arithmetic from value expressions** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - Add to `simplifyConditionText()`:
     - Strip ` * -?\d+(?:\s+or\s+-?\d+)?` from the end of expressions
     - Strip standalone `1 * -4 or -3` patterns (entire expression is pure arithmetic)

2. **Replace "Sub Space" with "this space"** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - Add `result = result.replace(/\bSub Space\b/g, 'this space');` to `simplifyConditionText()`

3. **Suppress noise summary-kind lines** — **Layer**: Engine — **File**: `packages/engine/src/kernel/tooltip-template-realizer.ts` — **Depends on**: none
   - In `realizeStep()`: when `m.kind === 'summary'`, apply `isNoiseLine()` check (which already catches identifier-only patterns). Additionally, for summary messages, relax the noise detection to also catch lines that start with action verbs but contain only Title Case words (no numbers, operators, or lowercase non-first words).

4. **Update tests** — **Layer**: Engine — **Depends on**: Steps 1-3

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/engine test` — must pass
3. `pnpm -F @ludoforge/runner test` — must pass
4. Visual check: verify arithmetic stripped, "Sub Space" → "this space", "Place From Available Or Map" gone

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Arithmetic stripping removes meaningful context | LOW | Player can't see transfer amounts | The variable names remain; only the math operator + constants are stripped |
| Summary suppression catches legitimate summaries | LOW | Player misses action summary text | Only suppress when text matches identifier pattern (no numbers, operators) |

## Implementation Verification Checklist

- [ ] `tooltip-template-realizer.ts`: Arithmetic ` * -N` and ` or -N` stripped from value expressions
- [ ] `tooltip-template-realizer.ts`: "Sub Space" → "this space" replacement
- [ ] `tooltip-template-realizer.ts`: Summary-kind messages with identifier-only text suppressed
- [ ] No "Place From Available Or Map" in step content
- [ ] No "1 * -4 or -3" or "Transfer Amount * -1" arithmetic visible
- [ ] "this space" replaces "Sub Space" in Train tooltip

## Test Impact

- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts`
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`

## Research Sources

- No external research needed

## Outcome

- Completion date: 2026-04-20
- What actually changed:
  - preserved the single-iteration action-tooltip plan and archived it because the active tooltip workflow now lives in the evaluation files and design docs rather than this stale iteration-specific plan
- Deviations from original plan:
  - none; the plan is being retired as historical planning context
- Verification results:
  - reference scan showed only historical planning-doc mentions, not an active runtime workflow dependency
