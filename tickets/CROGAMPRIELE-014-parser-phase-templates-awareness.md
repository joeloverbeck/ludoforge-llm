# CROGAMPRIELE-014: Parser and compose awareness for `phaseTemplates` section

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — parser, section identifier, compose pipeline
**Deps**: CROGAMPRIELE-005

## Problem

CROGAMPRIELE-005 added a top-level `phaseTemplates` field to `GameSpecDoc` and the `expandPhaseTemplates` expansion pass, but did not add parser awareness. Unlike batch markers, zone templates, and batch vars (which are union members within existing sections like `zones` or `globalVars`), `phaseTemplates` is a **top-level section** in `GameSpecDoc` — analogous to `turnStructure` or `actions`.

Without this ticket, YAML `phaseTemplates:` blocks in game specs are silently dropped: `section-identifier.ts` does not recognize the key, `parser.ts` has no merge handler, and `compose-gamespec.ts` cannot merge it across fragments. The field will always be `null` at parse time, which blocks CROGAMPRIELE-010 and CROGAMPRIELE-011 (spec migrations that need spec authors to write `phaseTemplates:` YAML).

## Assumption Reassessment (2026-03-02, verified)

1. `CANONICAL_SECTION_KEYS` in `section-identifier.ts:1-23` does not include `'phaseTemplates'`. **Confirmed.**
2. `mergeSection()` in `parser.ts:207-236` has no case for `'phaseTemplates'`. **Confirmed.**
3. `compose-gamespec.ts` `LIST_SECTIONS` (lines 9-25) does not include `'phaseTemplates'`. `assignListSection` (lines 257-310) has no case. **Confirmed.**
4. `getListSectionLength` in `parser.ts:432-457` does not include `'phaseTemplates'`. **Confirmed.**
5. `GameSpecDoc.phaseTemplates` is typed `readonly GameSpecPhaseTemplateDef[] | null` (line 444 of `game-spec-doc.ts`). It is an array, so it belongs in list-section handling (not singleton). **Confirmed.**
6. `packages/engine/test/unit/section-identifier.test.ts` does **not exist** — must be **created**, not modified.

## Architecture Check

1. Every other top-level `GameSpecDoc` field is registered in the section identifier, parser merge switch, and compose pipeline. `phaseTemplates` must follow the same pattern for consistency.
2. `phaseTemplates` contains only `GameSpecDoc` data (template definitions with params and phase bodies) — no GameDef/kernel changes. The section remains game-agnostic: it is a compiler-level abstraction.
3. No backwards-compatibility shims — just adding the missing registrations.

## What to Change

### 1. Add `'phaseTemplates'` to `CANONICAL_SECTION_KEYS` in `section-identifier.ts`

Add `'phaseTemplates'` to the array (after `'turnStructure'` or at end — order within the array does not affect behavior, only the `CanonicalSectionKey` union type).

### 2. Add fingerprint function `isPhaseTemplatesShape()` in `section-identifier.ts`

```typescript
function isPhaseTemplatesShape(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.phaseTemplates) &&
    value.phaseTemplates.every(
      (entry) => isRecord(entry) && typeof entry.id === 'string' && Array.isArray(entry.params),
    )
  );
}
```

Wire it into `identifyByFingerprint()` with `matches.push('phaseTemplates')`.

### 3. Add `'phaseTemplates'` merge handler in `parser.ts`

Add `'phaseTemplates'` to the list-section case in `mergeSection()` (line 218-234), the `mergeListSection` type union (line 315-331), and the `mergeListSection` switch body. Also add to `getListSectionLength` union (line 434-450).

```typescript
// In mergeListSection switch:
case 'phaseTemplates':
  (doc as MutableGameSpecDoc).phaseTemplates = (
    doc.phaseTemplates === null ? listValue : [...doc.phaseTemplates, ...listValue]
  ) as MutableGameSpecDoc['phaseTemplates'];
  return buildAnchoredPaths(section, listValue, existingLength);
```

### 4. Add `'phaseTemplates'` to `compose-gamespec.ts`

Add `'phaseTemplates'` to `LIST_SECTIONS` (line 9-25). Add a case to `assignListSection` (line 257-310).

```typescript
// In assignListSection switch:
case 'phaseTemplates':
  mutable.phaseTemplates = value as MutableGameSpecDoc['phaseTemplates'];
  break;
```

### 5. Add unit tests

Test that a game spec markdown with a `phaseTemplates:` YAML block:
- Is recognized by `resolveSectionsFromBlock` as the `'phaseTemplates'` section.
- Is merged into `doc.phaseTemplates` by the parser.
- Produces the expected `GameSpecPhaseTemplateDef[]` entries.
- Round-trips through `composeGameSpec` when split across fragments.

### 6. Update golden fixture

Add a `phaseTemplates` YAML block to `full-valid-spec.md` and update `full-valid-spec.golden.json` so the field is non-null in the golden expected doc. This proves the full parse path works end-to-end.

## Files to Touch

- `packages/engine/src/cnl/section-identifier.ts` (modify — add to array, add fingerprint)
- `packages/engine/src/cnl/parser.ts` (modify — add list-section case + type union)
- `packages/engine/src/cnl/compose-gamespec.ts` (modify — add to `LIST_SECTIONS` + `assignListSection`)
- `packages/engine/src/cnl/yaml-linter.ts` (modify — add `'phaseTemplates'` to its own `CANONICAL_SECTION_KEYS` set, which is a separate duplicate of the main set)
- `packages/engine/test/unit/section-identifier.test.ts` (**create** — add fingerprint test)
- `packages/engine/test/unit/parser.test.ts` (modify — add phaseTemplates parse test)
- `packages/engine/test/fixtures/cnl/full-valid-spec.md` (modify — add phaseTemplates block)
- `packages/engine/test/fixtures/cnl/full-valid-spec.golden.json` (modify — update expected doc)

## Out of Scope

- Expansion pass logic (already done in CROGAMPRIELE-005)
- Compiler pipeline wiring (CROGAMPRIELE-008)
- JSON Schema updates (CROGAMPRIELE-009)
- Validator awareness of `phaseTemplates` entries
- Game spec migrations (CROGAMPRIELE-010, CROGAMPRIELE-011)

## Acceptance Criteria

### Tests That Must Pass

1. `resolveSectionsFromBlock({ phaseTemplates: [...] })` returns `section: 'phaseTemplates'`.
2. A markdown spec with a `phaseTemplates:` YAML block produces `doc.phaseTemplates` containing the declared templates.
3. `identifyByFingerprint` recognizes a `phaseTemplates` block shape.
4. `composeGameSpec` merges `phaseTemplates` across fragments without data loss.
5. Golden fixture round-trip passes with non-null `phaseTemplates`.
6. Existing suite: `pnpm turbo test`

### Invariants

1. `phaseTemplates` is a list section — multiple YAML blocks append, not overwrite.
2. Parser produces `GameSpecPhaseTemplateDef[]` entries that match the types added in CROGAMPRIELE-005.
3. Source map anchored paths include `phaseTemplates[N].id` entries.
4. No game-specific logic introduced — the parser treats `phaseTemplates` generically like any other list section.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/section-identifier.test.ts` — fingerprint recognition for `phaseTemplates` shape. Rationale: validates section resolution.
2. `packages/engine/test/unit/parser.test.ts` — parse a spec with `phaseTemplates:` block, verify `doc.phaseTemplates` is populated. Rationale: validates merge handler.
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` — golden fixture with non-null `phaseTemplates`. Rationale: end-to-end parse path.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/section-identifier.test.js`
3. `node --test packages/engine/dist/test/unit/parser.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
