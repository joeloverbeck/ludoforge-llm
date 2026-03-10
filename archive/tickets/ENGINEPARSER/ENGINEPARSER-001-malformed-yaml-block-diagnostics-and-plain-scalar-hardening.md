# ENGINEPARSER-001: Malformed YAML Block Diagnostics and Plain-Scalar Hardening

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/yaml-linter.ts`, focused parser/linter tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/yaml-linter.ts`, `packages/engine/test/unit/yaml-linter.test.ts`, `packages/engine/test/unit/parser.test.ts`, `packages/engine/test/integration/parse-validate-full-spec.test.ts`

## Problem

An unquoted plain scalar containing an additional `: ` inside a value line can invalidate an entire YAML block. In production-scale sections such as `eventDecks`, that means one authoring typo can silently remove a whole section from the parsed `GameSpecDoc`, with the user seeing only generic or downstream failures unless they inspect parser diagnostics directly.

The immediate Fire in the Lake example was an event text line of the form:

`text: Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.`

This should be caught and explained directly at the parser/linter layer with a high-signal authoring diagnostic.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/cnl/parser.ts` currently uses `yaml.parseDocument(..., { strict: true, uniqueKeys: true })` and skips merging an entire block whenever `yamlDoc.errors.length > 0`.
2. `packages/engine/src/cnl/yaml-linter.ts` already emits a broad unquoted-colon warning (`CNL_YAML_001`) and parse-error diagnostics (`CNL_YAML_008`), but it does not distinguish the specific higher-signal failure mode “plain scalar value contains an additional `: ` token that turns the line into an accidental nested mapping”.
3. The current parser tests cover malformed YAML generically, and `packages/engine/test/unit/yaml-linter.test.ts` covers linter codes generically, but neither suite pins the exact authoring failure mode of colon-bearing event text inside realistic nested blocks such as `eventDecks`.

## Architecture Check

1. The clean fix lives in generic parser/linter infrastructure, not in Fire in the Lake data or in any game-specific special case.
2. `GameSpecDoc` remains the source of game-specific authoring data; `GameDef` and runtime stay agnostic because they only consume already-validated parsed structures.
3. No backwards-compatibility shim is needed. Invalid YAML should fail loudly and specifically rather than being tolerated through aliases or fallback parsing.
4. The preferred architecture is to strengthen the existing plain-scalar hardening path instead of adding a second overlapping colon rule. One precise linter signal plus one parser parse-error signal is cleaner than multiple near-duplicate diagnostics for the same malformed line.

## What to Change

### 1. Tighten the existing YAML hardening for colon-bearing plain scalars

Refine the plain-scalar colon hardening in `packages/engine/src/cnl/yaml-linter.ts` so it specifically flags unquoted scalar values containing a second `: ` token on the same line when the value is not already:

- quoted
- a block scalar (`|` / `>`)
- an inline flow collection

The diagnostic should be explicit that the value likely needs quoting because YAML is interpreting part of the text as a nested mapping. Avoid adding a second overlapping linter diagnostic when the existing plain-scalar hardening path can be made more precise.

### 2. Improve parser diagnostics for YAML block parse failures

Enhance `packages/engine/src/cnl/parser.ts` so `CNL_PARSER_YAML_PARSE_ERROR` is more actionable for this class of problem:

- preserve the current block-level error behavior
- include a `contextSnippet` when available
- ensure line/column information is stable
- provide a suggestion that points authors toward quoting plain text that contains `: `

The goal is that a malformed block fails with a direct authoring message before users have to reason about missing downstream sections.

### 3. Add regression coverage for realistic nested spec fragments

Extend linter/parser/integration tests so this exact failure mode is pinned in both minimal and realistic shapes:

- a focused linter regression for the malformed plain scalar line
- a small malformed `eventDecks` snippet
- a larger full-spec-style markdown fragment that proves parser diagnostics remain primary and deterministic

## Files to Touch

- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/src/cnl/yaml-linter.ts` (modify)
- `packages/engine/test/unit/yaml-linter.test.ts` (modify)
- `packages/engine/test/unit/parser.test.ts` (modify)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)

## Out of Scope

- Any game-specific data changes for Fire in the Lake
- Runtime/kernel behavior changes
- Changing YAML authoring rules beyond diagnostics for malformed plain scalars

## Acceptance Criteria

### Tests That Must Pass

1. Parsing a malformed `eventDecks` block with unquoted `text: ...: ...` emits a parser-stage error diagnostic that points at the offending line.
2. The tightened plain-scalar YAML hardening emits a direct authoring diagnostic for the same malformed line even before downstream compile fallout is inspected.
3. Existing suite: `pnpm -F @ludoforge/engine build`
4. Existing suite: `node --test packages/engine/dist/test/unit/yaml-linter.test.js`
5. Existing suite: `node --test packages/engine/dist/test/unit/parser.test.js`
6. Existing suite: `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
7. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Parser/linter diagnostics remain game-agnostic and do not key off Fire in the Lake identifiers.
2. Invalid YAML blocks must not be silently accepted or reinterpreted through fallback heuristics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/yaml-linter.test.ts` — add a focused malformed plain-scalar regression test and verify the linter points authors toward quoting the value.
2. `packages/engine/test/unit/parser.test.ts` — add a malformed nested-block parser regression test and verify the parser parse diagnostic includes stable location and authoring guidance.
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — add an end-to-end malformed nested-block test so realistic authoring failures are caught deterministically.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/yaml-linter.test.js`
3. `node --test packages/engine/dist/test/unit/parser.test.js`
4. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-10
- What changed:
  - tightened the existing `CNL_YAML_001` hardening so it targets the actual plain-scalar `: ` hazard instead of warning on any colon-bearing value
  - exempted inline flow collections from plain-scalar/special-character lint warnings, removing false positives from valid specs
  - upgraded `CNL_PARSER_YAML_PARSE_ERROR` diagnostics to include a stable summary message, `contextSnippet`, and colon-specific quoting guidance when the malformed line matches this failure mode
  - added regression coverage in `yaml-linter`, `parser`, and full-spec integration tests, and updated parser golden fixtures to the new diagnostic baseline
- Deviations from original plan:
  - refined the existing plain-scalar rule rather than introducing a second overlapping linter rule
  - updated golden fixtures because the cleaner linter behavior removed legacy false-positive warnings from valid flow-style YAML
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/yaml-linter.test.js`
  - `node --test packages/engine/dist/test/unit/parser.test.js`
  - `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
  - `node --test packages/engine/dist/test/unit/parser-validator.golden.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
