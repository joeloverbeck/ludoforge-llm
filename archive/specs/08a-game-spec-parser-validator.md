# Spec 08a: Game Spec Parser & Validator

**Status**: ✅ COMPLETED
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 02
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 1.1, 2.2A, 2.2B

## Overview

Implement the Markdown+YAML parser that extracts Game Spec sections from LLM-generated documents and validates their structure. This is the entry point for the LLM -> kernel pipeline: raw Markdown text goes in, a structured `GameSpecDoc` comes out (with diagnostics for any issues). The parser uses YAML 1.2 strict mode (`eemeli/yaml`) and includes a linter for the 20 most common LLM YAML mistakes.

Responsibility split:
- `parseGameSpec` does extraction, YAML hardening lint, strict parse, section mapping, merge policy, source mapping, and parser safety limits.
- `validateGameSpec` does structural and cross-reference validation, including required-section checks.
- Both functions are total and deterministic: never throw, always return diagnostics.

## Scope

### In Scope
- Markdown parsing: extract fenced YAML blocks (`yaml`, `yml`, or unlabeled fences that parse as mappings)
- YAML 1.2 strict parsing using `eemeli/yaml`
- Deterministic section identification and merge policy (order-independent)
- YAML hardening linter for 20 common LLM YAML mistakes
- `GameSpecDoc` type: parsed representation of all Game Spec sections
- `parseGameSpec(markdown): { doc: GameSpecDoc, sourceMap: GameSpecSourceMap, diagnostics: Diagnostic[] }`
- `validateGameSpec(doc, options?): Diagnostic[]` - structural and cross-reference validation
- Diagnostics with path, severity, suggestion, contextSnippet, and alternatives
- Input safety bounds (`maxInputBytes`, `maxYamlBlocks`, `maxBlockBytes`, `maxDiagnostics`)

### Out of Scope
- Macro expansion (Spec 08b)
- Compilation to GameDef (Spec 08b)
- Semantic validation that requires GameDef context (Spec 02's `validateGameDef`)
- Runtime execution of any parsed content
- Round-trip compilation (post-MVP)

## Key Types & Interfaces

### GameSpecDoc

```typescript
interface GameSpecDoc {
  readonly metadata: GameSpecMetadata | null;
  readonly constants: Readonly<Record<string, number>> | null;
  readonly globalVars: readonly GameSpecVarDef[] | null;
  readonly perPlayerVars: readonly GameSpecVarDef[] | null;
  readonly zones: readonly GameSpecZoneDef[] | null;
  readonly tokenTypes: readonly GameSpecTokenTypeDef[] | null;
  readonly setup: readonly GameSpecEffect[] | null;
  readonly turnStructure: GameSpecTurnStructure | null;
  readonly actions: readonly GameSpecActionDef[] | null;
  readonly triggers: readonly GameSpecTriggerDef[] | null;
  readonly endConditions: readonly GameSpecEndCondition[] | null;
}
```

Note: each field is nullable - `null` means the section was missing. Missing required sections are reported by `validateGameSpec`.

The `GameSpec*` types mirror the kernel types (Spec 02) but use looser typing suitable for pre-compilation representation.

```typescript
interface GameSpecMetadata {
  readonly id: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
}

interface GameSpecVarDef {
  readonly name: string;
  readonly type: string; // "int" - string here, enum after validation
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

interface GameSpecZoneDef {
  readonly id: string;
  readonly owner: string; // "none" | "player" - string here, validated later
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: readonly string[];
}

interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>;
}

interface GameSpecTurnStructure {
  readonly phases: readonly GameSpecPhaseDef[];
  readonly activePlayerOrder: string; // "roundRobin" | "fixed"
}

interface GameSpecPhaseDef {
  readonly id: string;
  readonly onEnter?: readonly unknown[];
  readonly onExit?: readonly unknown[];
}

interface GameSpecEffect {
  readonly [key: string]: unknown;
}

interface GameSpecActionDef {
  readonly id: string;
  readonly actor: unknown;
  readonly phase: string;
  readonly params: readonly unknown[];
  readonly pre: unknown | null;
  readonly cost: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly limits: readonly unknown[];
}

interface GameSpecTriggerDef {
  readonly id?: string;
  readonly event?: unknown;
  readonly when?: unknown;
  readonly match?: unknown;
  readonly effects: readonly unknown[];
}

interface GameSpecEndCondition {
  readonly when: unknown;
  readonly result: unknown;
}

interface SourceSpan {
  readonly blockIndex: number;
  readonly markdownLineStart: number; // 1-based
  readonly markdownColStart: number; // 1-based
  readonly markdownLineEnd: number; // 1-based
  readonly markdownColEnd: number; // 1-based
}

interface GameSpecSourceMap {
  readonly byPath: Readonly<Record<string, SourceSpan>>;
}
```

### Public API

```typescript
function parseGameSpec(markdown: string): {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
};

function validateGameSpec(
  doc: GameSpecDoc,
  options?: { readonly sourceMap?: GameSpecSourceMap },
): readonly Diagnostic[];
```

## Implementation Requirements

### Parsing Stages & Boundaries

- `parseGameSpec` reports lexical/syntax/section-mapping issues.
- `validateGameSpec` reports structural and cross-reference issues.
- Missing required sections are emitted only by `validateGameSpec`.
- `spec:lint` combines both diagnostic streams.

### Markdown Parsing

1. Split input on fenced code blocks (support `yaml`, `yml`, and bare fences).
2. For each candidate block:
   - Run YAML linter on raw block text.
   - Parse with YAML 1.2 strict mode.
   - Resolve section(s) using deterministic precedence:
     1. Explicit `section:` key (single-section block)
     2. Canonical top-level section keys (`metadata`, `constants`, `globalVars`, `perPlayerVars`, `zones`, `tokenTypes`, `setup`, `turnStructure`, `actions`, `triggers`, `endConditions`)
     3. Fingerprint fallback only when exactly one section type matches
   - If fallback matches none or multiple types, emit ambiguity diagnostic and skip ambiguous node.
3. Section mapping is order-independent.
4. Support multiple sections in one YAML block.
5. Apply merge policy for repeated sections:
   - Singleton sections (`metadata`, `constants`, `turnStructure`): first definition wins, later definitions warn.
   - List sections (`globalVars`, `perPlayerVars`, `zones`, `tokenTypes`, `setup`, `actions`, `triggers`, `endConditions`): append in encounter order.
6. Preserve array item order within each block exactly.
7. Build `sourceMap` for mapped canonical paths.

### YAML 1.2 Strict Parsing

Use `eemeli/yaml` strict settings:

```typescript
import { parse } from 'yaml';

const result = parse(yamlText, {
  schema: 'core',
  strict: true,
  uniqueKeys: true,
});
```

Key YAML 1.2 behavior:
- Bare `no`, `yes`, `on`, `off` are strings, not booleans.
- Bare `1.0` is numeric (unless quoted).
- Octal requires `0o` prefix.

### YAML Hardening Linter - 20 LLM Mistake Types

The linter checks common LLM YAML failures. It is lexical/syntax hardening only and MUST NOT enforce structural rules that belong to `validateGameSpec`.

| # | Mistake | Detection | Suggestion |
|---|---------|-----------|------------|
| 1 | Unquoted colons in values | Value contains `:` without quotes | Wrap value in quotes |
| 2 | Inconsistent indentation | Mixed 2-space and 4-space indent | Standardize to 2-space |
| 3 | Mixed tabs and spaces | Tab characters detected in indentation | Replace tabs with spaces |
| 4 | Unquoted boolean-like strings | Bare `yes`/`no`/`true`/`false`/`on`/`off` where string expected | Wrap in quotes |
| 5 | Trailing whitespace | Whitespace after value on a line | Remove trailing spaces |
| 6 | Duplicate keys | Same key appears twice in a mapping | Remove duplicate |
| 7 | Unknown section key | Unrecognized top-level section key | Use a canonical section name |
| 8 | Invalid YAML syntax | YAML parse error | Show line number and expected syntax |
| 9 | Unescaped special characters | `#`, `{`, `}`, `[`, `]`, `&`, `*` in unquoted strings | Wrap in quotes or escape |
| 10 | Bare multi-line strings | Multi-line value without `|` or `>` indicator | Use `|` for block scalar |
| 11 | Incorrect list syntax | Missing `-` prefix, or `-` without space | Use `- item` format |
| 12 | Type confusion (number vs string) | Numeric string unquoted where string needed | Wrap in quotes |
| 13 | Anchor/alias misuse | `&`/`*` used incorrectly or bad reference | Remove or fix anchor reference |
| 14 | Empty values | Key with no value (`key:`) | Provide explicit value or `null` |
| 15 | Comment-in-string errors | `#` inside unquoted string truncates value | Wrap in quotes |
| 16 | Encoding issues | Non-UTF-8 characters, BOM marker | Remove BOM, ensure UTF-8 |
| 17 | Missing document markers | Multiple documents without `---` separator | Add `---` between documents |
| 18 | Flow vs block style confusion | Mixing `{key: val}` with block style inconsistently | Use consistent style |
| 19 | Nested quoting errors | Quotes inside quoted strings not escaped | Escape or switch quote style |
| 20 | Multiline folding errors | `>` or `|` scalar with wrong continuation indent | Fix continuation indentation |

### parseGameSpec

`parseGameSpec(markdown: string)`:

1. Extract fenced code blocks.
2. Lint raw YAML blocks.
3. Parse each block with strict YAML 1.2.
4. Resolve sections using explicit precedence and ambiguity handling.
5. Populate `GameSpecDoc` using deterministic merge policy.
6. Build `sourceMap` for mapped paths.
7. Enforce safety limits:
   - `maxInputBytes` default 1 MiB
   - `maxYamlBlocks` default 128
   - `maxBlockBytes` default 256 KiB
   - `maxDiagnostics` default 500 (then append truncation warning)
8. Return `{ doc, sourceMap, diagnostics }`.

Total function: any input produces a result; malformed input produces diagnostics and partial output where possible.

### validateGameSpec

`validateGameSpec(doc, options?)` performs structural validation (without compilation):

1. Required sections present: `metadata`, `zones`, `turnStructure`, `actions`, `endConditions`.
2. Metadata completeness and ranges: `players.min >= 1`, `players.min <= players.max`.
3. Variable validity: required fields and `min <= init <= max`.
4. Zone validity: `owner` in `{none, player}`, `visibility` in `{public, owner, hidden}`, `ordering` in `{stack, queue, set}`.
5. Action validity: required fields (`id`, `actor`, `phase`, `effects`) and shape checks.
6. Turn structure validity: non-empty phases and valid `activePlayerOrder`.
7. Cross-reference checks: action phase references, trigger/action references, adjacency IDs.
8. Unknown keys: warning with deterministic fuzzy suggestions.
9. Identifier hygiene: trimmed/non-empty IDs, NFC normalization before uniqueness checks.

Each diagnostic includes:
- `path`
- `severity`
- `message`
- `suggestion`
- `alternatives` (when applicable)
- `contextSnippet` (when source mapping is available)

## Invariants

1. Parser handles sections in any order.
2. YAML 1.2 strict behavior is preserved (`no`/`yes`/`on`/`off` remain strings).
3. Missing required sections are emitted by `validateGameSpec`, not by parser lint.
4. Duplicate singleton sections produce warnings with deterministic first-wins behavior.
5. Parser is total: any input returns `{ doc, sourceMap, diagnostics }`.
6. Validator is total: any `GameSpecDoc` returns diagnostics.
7. YAML linter checks all 20 listed mistake types.
8. Unknown keys produce suggestions for closest valid keys.
9. Diagnostic output is deterministic: sorted by source position, then path, then code.
10. Parser and validator never mutate input objects.

## Required Tests

### Unit Tests

Parsing:
- Parse valid Game Spec with all sections -> populated `GameSpecDoc`, no parser errors.
- Parse reversed section order -> equivalent `GameSpecDoc`.
- Parse missing required section -> parser succeeds; validator emits required-section error.
- Duplicate singleton section (`metadata`) -> warning, first definition used.
- Repeated list section (`actions`) across blocks -> append order preserved.
- Ambiguous fallback section fingerprint -> ambiguity diagnostic.
- Empty input -> all-null `GameSpecDoc` with no crash.
- Non-YAML content -> parse diagnostics with line information.
- Source mapping exists for mapped canonical paths.

YAML 1.2 strict:
- Bare `no`/`yes`/`on`/`off` parse as strings.
- Quoted `"true"` is string while bare `true` is boolean.
- Quoted numeric strings remain strings.

YAML linter:
- One test per mistake type (20 total).

Validation:
- Valid `GameSpecDoc` -> zero errors.
- Missing metadata -> error.
- Action references nonexistent phase -> error with alternatives.
- Variable with `min > max` -> error.
- Unknown key in action definition -> warning with suggestion.
- Duplicate IDs after NFC normalization -> error.

### Integration Tests

- Realistic full markdown spec parses and validates with zero errors.
- Spec with multiple independent issues returns all expected diagnostics.
- `spec:lint` flow (`parseGameSpec` + `validateGameSpec`) has stable deterministic output ordering.

### Property Tests

- Any markdown input produces a parse result (no crash).
- Every `Diagnostic` has non-empty `path` and `message`.
- `parseGameSpec` is deterministic for identical input.
- Diagnostic ordering is deterministic for identical input.

### Golden Tests

- Known valid Game Spec markdown -> expected `GameSpecDoc` and source-map anchors.
- Known invalid Game Spec -> expected diagnostics (paths, severities, suggestions).

## Acceptance Criteria

- [ ] Parser extracts YAML blocks from markdown correctly.
- [ ] Sections resolved with deterministic precedence (explicit `section`, canonical keys, single-match fallback).
- [ ] YAML 1.2 strict mode has no implicit coercion for bare yes/no/on/off.
- [ ] `eemeli/yaml` is used (not `js-yaml`).
- [ ] YAML linter detects all 20 listed mistake types.
- [ ] Missing required sections are emitted by `validateGameSpec`.
- [ ] Parser never throws and always returns `{ doc, sourceMap, diagnostics }`.
- [ ] Parser enforces input and diagnostic safety limits.
- [ ] Validation catches structural and cross-reference errors.
- [ ] Diagnostics include path, severity, message, and suggestion.
- [ ] Unknown keys produce fuzzy-matched suggestions.

## Files to Create/Modify

```
src/cnl/parser.ts                # NEW - markdown parsing, YAML extraction, merge policy
src/cnl/yaml-linter.ts           # NEW - 20-mistake YAML hardening linter
src/cnl/game-spec-doc.ts         # NEW - GameSpecDoc type definitions
src/cnl/source-map.ts            # NEW - source span/path mapping helpers
src/cnl/validate-spec.ts         # NEW - validateGameSpec structural validation
src/cnl/section-identifier.ts    # NEW - deterministic section resolver
src/cnl/index.ts                 # MODIFY - re-export parser APIs
test/unit/parser.test.ts         # NEW - parsing + merge policy tests
test/unit/yaml-linter.test.ts    # NEW - linter tests (20 mistakes)
test/unit/validate-spec.test.ts  # NEW - structural validation tests
test/unit/yaml-strict.test.ts    # NEW - YAML 1.2 strict behavior tests
test/unit/source-map.test.ts     # NEW - source mapping stability tests
test/integration/parse-full-spec.test.ts  # NEW - full spec lint pipeline integration
```

## Outcome

- Completion date: 2026-02-10
- What was changed:
  - Implemented the parser/validator pipeline and supporting types across `src/cnl/parser.ts`, `src/cnl/validate-spec.ts`, `src/cnl/section-identifier.ts`, `src/cnl/source-map.ts`, `src/cnl/yaml-linter.ts`, `src/cnl/game-spec-doc.ts`, and `src/cnl/index.ts`.
  - Added parser, validator, and YAML hardening test coverage in `test/unit/parser.test.ts`, `test/unit/validate-spec.test.ts`, `test/unit/yaml-linter.test.ts`, and `test/unit/parser-validator.golden.test.ts`.
- Deviations from original plan:
  - The planned `test/unit/yaml-strict.test.ts`, `test/unit/source-map.test.ts`, and `test/integration/parse-full-spec.test.ts` are represented by consolidated coverage in the current parser/validator unit and golden tests.
- Verification results:
  - `npm run test:unit -- --coverage=false` passed on 2026-02-10 (331 tests, 0 failures).
