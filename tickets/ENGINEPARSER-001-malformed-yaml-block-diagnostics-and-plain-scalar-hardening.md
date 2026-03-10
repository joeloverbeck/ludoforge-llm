# ENGINEPARSER-001: Malformed YAML Block Diagnostics and Plain-Scalar Hardening

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/yaml-linter.ts`, parser-facing tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/parser.ts`, `packages/engine/src/cnl/yaml-linter.ts`, `packages/engine/test/unit/parser.test.ts`, `packages/engine/test/integration/parse-validate-full-spec.test.ts`

## Problem

An unquoted plain scalar containing an additional `: ` inside a value line can invalidate an entire YAML block. In production-scale sections such as `eventDecks`, that means one authoring typo can silently remove a whole section from the parsed `GameSpecDoc`, with the user seeing only generic or downstream failures unless they inspect parser diagnostics directly.

The immediate Fire in the Lake example was an event text line of the form:

`text: Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.`

This should be caught and explained directly at the parser/linter layer with a high-signal authoring diagnostic.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/cnl/parser.ts` currently uses `yaml.parseDocument(..., { strict: true, uniqueKeys: true })` and skips merging an entire block whenever `yamlDoc.errors.length > 0`.
2. `packages/engine/src/cnl/yaml-linter.ts` has several YAML hardening checks, but it does not currently target the specific plain-scalar pattern “mapping key followed by an unquoted value that itself contains `: `”.
3. The current parser tests cover malformed YAML generically, but they do not pin the exact authoring failure mode of colon-bearing event text inside realistic nested blocks such as `eventDecks`.

## Architecture Check

1. The clean fix lives in generic parser/linter infrastructure, not in Fire in the Lake data or in any game-specific special case.
2. `GameSpecDoc` remains the source of game-specific authoring data; `GameDef` and runtime stay agnostic because they only consume already-validated parsed structures.
3. No backwards-compatibility shim is needed. Invalid YAML should fail loudly and specifically rather than being tolerated through aliases or fallback parsing.

## What to Change

### 1. Add targeted YAML hardening for colon-bearing plain scalars

Add a dedicated linter rule in `packages/engine/src/cnl/yaml-linter.ts` that flags unquoted scalar values containing a second `: ` token on the same line when the value is not already:

- quoted
- a block scalar (`|` / `>`)
- an inline flow collection

The diagnostic should be explicit that the value likely needs quoting because YAML is interpreting part of the text as a nested mapping.

### 2. Improve parser diagnostics for YAML block parse failures

Enhance `packages/engine/src/cnl/parser.ts` so `CNL_PARSER_YAML_PARSE_ERROR` is more actionable for this class of problem:

- preserve the current block-level error behavior
- include a `contextSnippet` when available
- ensure line/column information is stable
- provide a suggestion that points authors toward quoting plain text that contains `: `

The goal is that a malformed block fails with a direct authoring message before users have to reason about missing downstream sections.

### 3. Add regression coverage for realistic nested spec fragments

Extend parser/integration tests so this exact failure mode is pinned in both minimal and realistic shapes:

- a small malformed `eventDecks` snippet
- a larger full-spec-style markdown fragment that proves parser diagnostics remain primary and deterministic

## Files to Touch

- `packages/engine/src/cnl/parser.ts` (modify)
- `packages/engine/src/cnl/yaml-linter.ts` (modify)
- `packages/engine/test/unit/parser.test.ts` (modify)
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` (modify)

## Out of Scope

- Any game-specific data changes for Fire in the Lake
- Runtime/kernel behavior changes
- Changing YAML authoring rules beyond diagnostics for malformed plain scalars

## Acceptance Criteria

### Tests That Must Pass

1. Parsing a malformed `eventDecks` block with unquoted `text: ...: ...` emits a parser-stage error diagnostic that points at the offending line.
2. The new YAML hardening rule emits a direct authoring diagnostic for the same malformed line even before downstream compile fallout is inspected.
3. Existing suite: `pnpm -F @ludoforge/engine build`
4. Existing suite: `node --test packages/engine/dist/test/unit/parser.test.js`
5. Existing suite: `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`

### Invariants

1. Parser/linter diagnostics remain game-agnostic and do not key off Fire in the Lake identifiers.
2. Invalid YAML blocks must not be silently accepted or reinterpreted through fallback heuristics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/parser.test.ts` — add a focused malformed plain-scalar regression test and verify high-signal diagnostics.
2. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — add an end-to-end malformed nested-block test so realistic authoring failures are caught deterministically.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/parser.test.js`
3. `node --test packages/engine/dist/test/integration/parse-validate-full-spec.test.js`
4. `pnpm run check:ticket-deps`
