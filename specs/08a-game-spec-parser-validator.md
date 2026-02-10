# Spec 08a: Game Spec Parser & Validator

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 02
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 1.1, 2.2A, 2.2B

## Overview

Implement the Markdown+YAML parser that extracts Game Spec sections from LLM-generated documents and validates their structure. This is the entry point for the LLM → kernel pipeline: raw Markdown text goes in, a structured `GameSpecDoc` comes out (with diagnostics for any issues). The parser uses YAML 1.2 strict mode (eemeli/yaml) and includes a linter for the 20 most common LLM YAML mistakes. The parser is total — any input produces a result, never throws.

## Scope

### In Scope
- Markdown parsing: extract fenced YAML blocks (code fences with any label)
- YAML 1.2 strict parsing using `eemeli/yaml` package
- Section identification by `section:` key inside each YAML block (order-independent)
- YAML hardening linter for 20 common LLM YAML mistakes
- `GameSpecDoc` type: parsed representation of all Game Spec sections
- `parseGameSpec(markdown): { doc: GameSpecDoc, diagnostics: Diagnostic[] }`
- `validateGameSpec(doc): Diagnostic[]` — structural and cross-reference validation
- Diagnostics with path, severity, suggestion, contextSnippet, and alternatives

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

Note: Each field is nullable — `null` means the section was missing from the spec. This allows the parser to return partial results with diagnostics for missing sections, rather than failing entirely.

The `GameSpec*` types mirror the kernel types (Spec 02) but use looser typing suitable for pre-compilation representation. For example, `GameSpecEffect` may use string-based references that haven't been resolved yet, while the kernel's `EffectAST` uses typed references.

```typescript
interface GameSpecMetadata {
  readonly id: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
}

interface GameSpecVarDef {
  readonly name: string;
  readonly type: string; // "int" — string here, enum after validation
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

interface GameSpecZoneDef {
  readonly id: string;
  readonly owner: string; // "none" | "player" — string here, validated later
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: readonly string[];
}

interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>; // prop name → type string
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
  readonly [key: string]: unknown; // loose typing pre-compilation
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
```

### Public API

```typescript
// Parse a Game Spec markdown document into structured form
function parseGameSpec(markdown: string): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
};

// Validate a parsed GameSpecDoc for structural correctness
function validateGameSpec(doc: GameSpecDoc): readonly Diagnostic[];
```

## Implementation Requirements

### Markdown Parsing

1. Split input on fenced code blocks: detect `` ```yaml ``, `` ```yml ``, or bare `` ``` `` followed by content and closing `` ``` ``
2. For each fenced block:
   - Parse as YAML 1.2 strict using `eemeli/yaml`
   - Look for a `section:` key (or identify by content structure if no explicit section key)
   - Map to the appropriate GameSpecDoc field
3. Sections are identified by content keys, NOT by position in the document:
   - Block containing `id:` + `players:` → metadata
   - Block containing `global:` or `perPlayer:` → variables
   - Block containing items with `owner:` + `visibility:` → zones
   - Block containing items with `actor:` + `phase:` + `effects:` → actions
   - Block containing items with `when:` + `result:` → endConditions
   - Block containing `phases:` + `activePlayerOrder:` → turnStructure
   - And so on for each section type
4. Handle the example format from brainstorming section 1.1 where multiple sections may be in a single YAML block (separated by different top-level keys)

### YAML 1.2 Strict Parsing

Use `eemeli/yaml` with strict settings:
```typescript
import { parse } from 'yaml';
const result = parse(yamlText, {
  schema: 'core',      // YAML 1.2 core schema
  strict: true,         // strict mode
  uniqueKeys: true,     // reject duplicate keys
  // Do NOT use 'json' schema — it's too permissive
});
```

Key YAML 1.2 behaviors (different from YAML 1.1):
- Bare `no`, `yes`, `on`, `off` are **strings**, not booleans
- Bare `1.0` is a number (unquoted) or string (quoted)
- Octal numbers use `0o` prefix (not bare leading zero)

### YAML Hardening Linter — 20 LLM Mistake Types

The linter checks for these common LLM YAML generation failures. Each produces a diagnostic with severity, path, message, and suggestion.

| # | Mistake | Detection | Suggestion |
|---|---------|-----------|------------|
| 1 | Unquoted colons in values | Value contains `:` without quotes | Wrap value in quotes |
| 2 | Inconsistent indentation | Mixed 2-space and 4-space indent | Standardize to 2-space |
| 3 | Mixed tabs and spaces | Tab characters detected in indentation | Replace tabs with spaces |
| 4 | Unquoted boolean-like strings | Bare `yes`/`no`/`true`/`false`/`on`/`off` where string expected | Wrap in quotes |
| 5 | Trailing whitespace | Whitespace after value on a line | Remove trailing spaces |
| 6 | Duplicate keys | Same key appears twice in a mapping | Remove duplicate |
| 7 | Missing required sections | Required section not found | Add section with template |
| 8 | Invalid YAML syntax | YAML parse error | Show line number and expected syntax |
| 9 | Unescaped special characters | `#`, `{`, `}`, `[`, `]`, `&`, `*` in unquoted strings | Wrap in quotes or escape |
| 10 | Bare multi-line strings | Multi-line value without `|` or `>` indicator | Use `|` for block scalar |
| 11 | Incorrect list syntax | Missing `-` prefix, or `-` without space | Use `- item` format |
| 12 | Type confusion (number vs string) | Numeric string unquoted where string needed | Wrap in quotes to preserve string type |
| 13 | Anchor/alias misuse | `&`/`*` used incorrectly or pointing to nonexistent anchor | Remove or fix anchor reference |
| 14 | Empty values | Key with no value (bare `key:`) | Provide explicit value or use `null` |
| 15 | Comment-in-string errors | `#` inside unquoted string truncates value | Wrap in quotes |
| 16 | Encoding issues | Non-UTF-8 characters, BOM marker | Remove BOM, ensure UTF-8 |
| 17 | Missing document markers | Multiple documents without `---` separator | Add `---` between documents |
| 18 | Flow vs block style confusion | Mixing `{key: val}` inline with block indented style | Use consistent style |
| 19 | Nested quoting errors | Quotes inside quoted strings not escaped | Use alternate quote style or escape |
| 20 | Multiline folding errors | `>` or `|` scalar with wrong indentation of continuation | Fix continuation line indentation |

**Implementation**: Run the linter on raw YAML text BEFORE parsing. Some checks (duplicate keys, type confusion) can also run on the parsed result. The linter should be fast and produce all applicable warnings in a single pass.

### parseGameSpec

`parseGameSpec(markdown: string)`:

1. Extract fenced code blocks from markdown
2. For each block: run YAML linter → collect diagnostics
3. For each block: parse YAML 1.2 strict
   - If parse fails: add error diagnostic with line number and suggestion, continue to next block
4. Identify section type from parsed content
   - If section type unrecognized: add warning diagnostic
5. Populate `GameSpecDoc` fields from identified sections
   - If duplicate section: add warning diagnostic, use first occurrence
6. Return `{ doc, diagnostics }`

**Total function**: ANY input produces a result. Empty string → GameSpecDoc with all null fields + diagnostics listing all missing sections. Malformed YAML → partial doc + parse error diagnostics. The function never throws.

### validateGameSpec

`validateGameSpec(doc: GameSpecDoc)`:

Structural validation (does NOT require compilation or GameDef):

1. **Required sections present**: metadata, zones, turnStructure, actions, endConditions must be non-null
2. **Metadata completeness**: id and players fields present, players.min >= 1, players.min <= players.max
3. **Variable definitions valid**: each var has name, type, init, min, max; min <= init <= max
4. **Zone definitions valid**: each zone has id, owner in {"none","player"}, visibility in {"public","owner","hidden"}, ordering in {"stack","queue","set"}
5. **Action definitions valid**: each action has id, actor, phase, effects; params/pre/cost/limits have correct structure
6. **Turn structure valid**: at least one phase, activePlayerOrder is valid string
7. **Cross-reference validation within spec**: action phase references must match a defined phase id; trigger event action references must match a defined action id
8. **No unknown keys**: warn on unexpected keys in any section (fuzzy-match to suggest correct key name)
9. **Adjacency references valid**: zone adjacentTo references match defined zone ids

Each check produces a `Diagnostic` with:
- `path`: location in the spec (e.g., `actions[2].phase`)
- `severity`: error for missing required fields, warning for suspicious patterns
- `suggestion`: concrete fix
- `alternatives`: valid options for reference mismatches

## Invariants

1. Parser handles sections in any order (not position-dependent)
2. YAML 1.2 strict: bare `no` is string `"no"`, not boolean `false`
3. YAML 1.2 strict: bare `1.0` is number `1.0` (unquoted), or string `"1.0"` (quoted)
4. Missing required sections produce error diagnostics (not crashes)
5. Duplicate section keys produce warning diagnostics
6. Diagnostics include `path` pointing to exact location in spec
7. Diagnostics include `suggestion` for common mistakes (with fuzzy-match alternatives)
8. Parser is total: any input produces a result (`{ doc, diagnostics }`), never throws
9. YAML linter detects all 20 listed LLM mistake types
10. Unknown keys produce warnings with suggestions for the most similar valid key

## Required Tests

### Unit Tests

**Parsing**:
- Parse valid Game Spec with all sections → GameSpecDoc has all fields populated, zero error diagnostics
- Parse Game Spec with sections in reversed order → same GameSpecDoc (order-independent)
- Parse Game Spec with missing required section (e.g., no actions) → error diagnostic for missing section
- Parse Game Spec with duplicate section → warning diagnostic, first section used
- Parse empty string → all-null GameSpecDoc, diagnostics list all missing required sections
- Parse non-YAML content → parse error diagnostics with line numbers

**YAML 1.2 strict**:
- Bare `no` parsed as string `"no"`, not boolean
- Bare `yes` parsed as string `"yes"`, not boolean
- Bare `on` parsed as string `"on"`, not boolean
- Bare `off` parsed as string `"off"`, not boolean
- Quoted `"true"` is string, unquoted `true` is boolean
- Unquoted `42` is number, quoted `"42"` is string

**YAML linter** (one test per mistake type):
- Mistake #1: unquoted colon → diagnostic with suggestion
- Mistake #2: inconsistent indent → diagnostic
- Mistake #3: tab character → diagnostic
- Mistake #4: unquoted boolean-like → diagnostic
- Mistake #5: trailing whitespace → diagnostic
- Mistake #6: duplicate key → diagnostic
- (... tests for all 20 mistake types)

**Validation**:
- Valid GameSpecDoc → zero diagnostics
- Missing metadata → error diagnostic
- Action references nonexistent phase → error with alternatives listing valid phases
- Zone referenced in action doesn't exist → error with alternatives
- Variable with min > max → error
- Unknown key in action definition → warning with suggestion for closest valid key

**Malformed YAML**:
- YAML with syntax error → parse error with line number and suggestion
- YAML with invalid indentation → error with correct indentation hint

### Integration Tests

- Full realistic Game Spec markdown (from brainstorming example) → parses successfully with zero errors
- Game Spec with 3 different issues → all 3 reported as separate diagnostics

### Property Tests

- Any syntactically valid YAML block (generated randomly) produces a parseable result (no crashes)
- Every `Diagnostic` has non-empty `path` and non-empty `message`
- `parseGameSpec` is deterministic: same input → same output

### Golden Tests

- Known valid Game Spec markdown (brainstorming section 1.1 example) → expected GameSpecDoc structure
- Known invalid Game Spec → expected specific diagnostics

## Acceptance Criteria

- [ ] Parser extracts YAML blocks from markdown correctly
- [ ] Sections identified by content (order-independent)
- [ ] YAML 1.2 strict mode: no implicit boolean coercion of bare yes/no/on/off
- [ ] `eemeli/yaml` is used (NOT js-yaml)
- [ ] YAML linter detects all 20 listed LLM mistake types
- [ ] Missing required sections produce error diagnostics
- [ ] Parser never throws — any input produces `{ doc, diagnostics }`
- [ ] Validation catches cross-reference errors within the spec
- [ ] Diagnostics include path, severity, message, and suggestion
- [ ] Unknown keys produce warnings with fuzzy-matched suggestions

## Files to Create/Modify

```
src/cnl/parser.ts                # NEW — markdown parsing, YAML block extraction
src/cnl/yaml-linter.ts           # NEW — 20 LLM YAML mistake linter
src/cnl/game-spec-doc.ts         # NEW — GameSpecDoc type definitions
src/cnl/validate-spec.ts         # NEW — validateGameSpec structural validation
src/cnl/section-identifier.ts    # NEW — identify section type from YAML content
src/cnl/index.ts                 # MODIFY — re-export parser APIs
test/unit/parser.test.ts         # NEW — markdown + YAML parsing tests
test/unit/yaml-linter.test.ts    # NEW — linter tests (20 mistake types)
test/unit/validate-spec.test.ts  # NEW — structural validation tests
test/unit/yaml-strict.test.ts    # NEW — YAML 1.2 strict behavior tests
test/integration/parse-full-spec.test.ts  # NEW — full spec parsing integration
```
