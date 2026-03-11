# Validation Boundary: Compiler vs Kernel

This document clarifies the boundary between **compiler-time** validation (GameSpec → GameDef) and **kernel-time** validation (GameDef structural/behavioral correctness).

## Compiler Validation (`packages/engine/src/cnl/`)

The compiler validates the **Game Spec document** (Markdown + YAML) during the `parseGameSpec → validateGameSpec → expandMacros → compileGameSpecToGameDef` pipeline.

**Scope**: structural correctness of the input specification.

| Concern | Examples |
|---------|----------|
| YAML syntax | Malformed YAML blocks, invalid YAML 1.2 |
| Field presence | Missing required fields (e.g., `zones`, `tokens`, `phases`) |
| Type shapes | Wrong field types (string where number expected) |
| Reference resolution | Zone/token/variable IDs that don't exist in the spec |
| Macro expansion | Template parameter validation, board generation |
| Spec-level constraints | Duplicate IDs, naming conventions, section ordering |

**Output**: Either a valid `GameDef` JSON or a list of compiler diagnostics.

## Kernel Validation (`packages/engine/src/kernel/`)

The kernel validates the **compiled GameDef JSON** via `validateGameDef()`, which delegates to structural validators (`validate-gamedef-structure.ts`, `validate-gamedef-core.ts`, `validate-gamedef-extensions.ts`) and behavioral validators.

**Scope**: behavioral correctness and internal consistency of the game definition.

| Concern | Examples |
|---------|----------|
| Effect AST | Valid effect nodes, correct argument shapes, binder canonicality |
| Condition AST | Boolean arity, comparison operand types, spatial predicate well-formedness |
| Value expressions | Numeric type requirements, division-by-zero guards, aggregate bindings |
| Queries & filters | Token filter predicates, choice option contracts, unique-key constraints |
| Event structures | Post-adjacency behavior, free-operation grant overlaps, sequence-context linkage |
| Cross-reference integrity | Zone selectors, map-space property references, scoped variable references |
| Contract enforcement | Turn-flow action-class contracts, free-operation grant viability |

**Output**: A list of `Diagnostic` objects (code, path, severity, message, suggestion).

## Behavioral Validator Module Structure

After the VALDECOMP decomposition, kernel behavioral validation is organized into 6 focused modules plus a thin orchestrator:

```
validate-gamedef-behavior.ts          ← Thin orchestrator (~35 LOC, re-exports only)
  ├── validate-behavior-shared.ts     ← Shared helpers (reference validation, binding, map-space, etc.)
  ├── validate-effects.ts             ← Effect AST validation, free-operation grant contracts
  ├── validate-conditions.ts          ← Condition AST validation (boolean, spatial, comparison)
  ├── validate-values.ts              ← Value expression validation (arithmetic, aggregates, refs)
  ├── validate-queries.ts             ← Token filters, choice options, options queries
  └── validate-events.ts              ← Post-adjacency behavior, overlap detection, sequence linkage
```

### Dependency DAG

```
shared → values → conditions → queries → effects → events
```

Cross-module calls (e.g., `validateValueExpr` ↔ `validateConditionAst`) use ESM live bindings with lazy imports inside function bodies to avoid circular dependency issues.

### Consumer Entry Points

- **`validate-gamedef-core.ts`** imports: `validateConditionAst`, `validateEffectAst`, `validateOptionsQuery`, `validatePostAdjacencyBehavior`
- **`validate-gamedef-extensions.ts`** imports: `validateConditionAst`, `validateEffectAst`, `validateValueExpr`
- All imports go through `validate-gamedef-behavior.ts` re-exports for backwards compatibility.

## Key Principle

The compiler ensures the GameDef is **well-formed**; the kernel validators ensure it is **well-behaved**. A GameDef that passes compiler validation may still fail kernel validation if its behavioral rules contain semantic errors (e.g., a condition referencing a non-existent marker state, or a free-operation grant with an invalid sequence context).
