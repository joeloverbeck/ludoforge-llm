# GAMSPEPARVAL-005 - Markdown YAML Extraction, Strict Parsing, and Safety Limits

**Status**: ✅ COMPLETED

## Goal
Implement parser ingestion pipeline from markdown text to parsed YAML candidates with strict YAML 1.2 behavior and safety bounds.

## Assumption Reassessment (2026-02-10)
- Previous assumption: strict YAML behavior had dedicated coverage in `test/unit/yaml-strict.test.ts`.
- Actual repo state: there is no `test/unit/yaml-strict.test.ts`; strict parser behavior is currently exercised in `test/unit/parser.test.ts` (and YAML lint behavior in `test/unit/yaml-linter.test.ts`).
- Previous assumption: parser should emit diagnostics for general non-YAML markdown content.
- Actual parser/spec behavior (Spec 08a): parser ingests fenced YAML candidates; plain non-fenced markdown is ignored and should not error.
- Previous assumption: parser safety limits were fully present.
- Actual code state: only `maxDiagnostics` exists; `maxInputBytes`, `maxYamlBlocks`, and `maxBlockBytes` are missing and need implementation in this ticket.

## Scope
- Extract fenced blocks for `yaml`, `yml`, and unlabeled fences that parse as mappings.
- Parse YAML using `eemeli/yaml` strict settings (`schema: core`, `strict: true`, `uniqueKeys: true`).
- Enforce parser limits:
  - `maxInputBytes` (default 1 MiB)
  - `maxYamlBlocks` (default 128)
  - `maxBlockBytes` (default 256 KiB)
  - `maxDiagnostics` (default 500)
- Return partial output + diagnostics rather than throwing.

## File List (Expected to Touch)
- `src/cnl/parser.ts`
- `test/unit/parser.test.ts`

## Out of Scope
- Section merge semantics beyond wiring parser hooks.
- Source-map path mapping.
- Structural/cross-reference validation.
- Macro expansion or GameDef compilation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/parser.test.js` covering:
  - empty input returns all-null doc without crash
  - malformed fenced YAML yields parser diagnostics (line/column included when available)
  - safety limits trigger diagnostics without throw
  - strict YAML 1.2 behavior keeps bare `no`/`yes`/`on`/`off` as strings

### Invariants that must remain true
- YAML 1.2 strict semantics are preserved (`no`/`yes`/`on`/`off` remain strings).
- Parser is total for arbitrary markdown input.
- `eemeli/yaml` is the parser backend (not `js-yaml`).
- Parser does not mutate input markdown.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Added parser safety limits for `maxInputBytes`, `maxYamlBlocks`, and `maxBlockBytes` in `parseGameSpec`, with non-throwing diagnostics and partial output behavior.
  - Kept strict YAML parsing on `eemeli/yaml` (`schema: core`, `strict: true`, `uniqueKeys: true`) and improved parse diagnostics to include line/column in message when available.
  - Expanded `test/unit/parser.test.ts` with coverage for empty input shape, malformed fenced YAML diagnostics, strict YAML 1.2 scalar behavior, and the three new parser limit paths.
- Deviations from original plan:
  - Replaced the nonexistent `yaml-strict` dedicated test target with parser-level strictness assertions in `test/unit/parser.test.ts`, matching actual repo structure.
  - Updated the non-YAML acceptance expectation to malformed fenced YAML diagnostics, consistent with fenced-block ingestion behavior in Spec 08a.
- Verification:
  - `npm run clean && npm run build && node --test dist/test/unit/parser.test.js` passed.
  - `npm test` passed.
