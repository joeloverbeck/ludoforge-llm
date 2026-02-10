# GAMSPEPARVAL-005 - Markdown YAML Extraction, Strict Parsing, and Safety Limits

## Goal
Implement parser ingestion pipeline from markdown text to parsed YAML candidates with strict YAML 1.2 behavior and safety bounds.

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
- `test/unit/yaml-strict.test.ts`

## Out of Scope
- Section merge semantics beyond wiring parser hooks.
- Source-map path mapping.
- Structural/cross-reference validation.
- Macro expansion or GameDef compilation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/yaml-strict.test.js`
- `node --test dist/test/unit/parser.test.js` covering:
  - empty input returns all-null doc without crash
  - non-YAML content yields diagnostics with line context
  - safety limits trigger diagnostics without throw

### Invariants that must remain true
- YAML 1.2 strict semantics are preserved (`no`/`yes`/`on`/`off` remain strings).
- Parser is total for arbitrary markdown input.
- `eemeli/yaml` is the parser backend (not `js-yaml`).
- Parser does not mutate input markdown.
