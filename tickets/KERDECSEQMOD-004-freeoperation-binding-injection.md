# KERDECSEQMOD-004 - `__freeOperation` Binding Injection

**Status**: Not started
**Spec**: `specs/25b-kernel-decision-sequence-model.md` (Task 25b.4)
**Depends on**: KERDECSEQMOD-003

## Goal

Inject `move.freeOperation` into the effect execution context bindings as `__freeOperation` (reserved kernel prefix) so that resolution effects can conditionally skip per-space cost spending. This allows operation effects to reference the free-operation flag via `{ ref: 'binding', name: '__freeOperation' }`.

## Scope

- Modify the effect context construction in `applyMove()` to include `__freeOperation` binding
- The binding value is `move.freeOperation ?? false` (defaults to `false` if absent)
- Add unit tests verifying the binding is accessible in resolution effects

## File list it expects to touch

- `src/kernel/apply-move.ts`
- `test/unit/kernel/apply-move.test.ts`

## Out of scope

- The `legalChoices()` function (KERDECSEQMOD-001)
- The `legalMoves()` template moves (KERDECSEQMOD-002)
- The `validateMove()` relaxation (KERDECSEQMOD-003)
- Agent updates (KERDECSEQMOD-005)
- Integration tests (KERDECSEQMOD-006)
- FITL-specific operation effects that consume `__freeOperation` (Spec 26)
- Enforcing the `__` prefix reservation in game spec validation (documentation-only for now)

## Implementation Details

### Binding injection in effect context

In the effect context construction within `applyMove()`, add `__freeOperation` to the bindings:

```typescript
const bindings = {
  ...move.params,
  __freeOperation: move.freeOperation ?? false,
};
```

### How resolution effects use it

Operation resolution effects can conditionally skip per-space cost via:

```yaml
- if:
    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
    then:
      - addVar: { scope: global, var: arvnResources, delta: -3 }
```

When `__freeOperation` is `true`, the condition `__freeOperation != true` is `false`, so the cost deduction is skipped.

### Reserved prefix convention

Binding names starting with `__` (double underscore) are reserved for kernel use. Game specifications MUST NOT use binding names starting with `__`. This is a convention documented in the spec -- compile-time enforcement is a future enhancement, not required for this ticket.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `node --test dist/test/unit/kernel/apply-move.test.js`

### Test cases (in `test/unit/kernel/apply-move.test.ts`)

1. `freeOperation: true` on the move makes `__freeOperation` binding resolve to `true` in effect context
2. `freeOperation: false` (or absent) on the move makes `__freeOperation` binding resolve to `false`
3. Resolution effects can read `__freeOperation` via `{ ref: 'binding', name: '__freeOperation' }`
4. Per-space cost deduction is conditionally skipped when `__freeOperation` is `true` (using an `if` effect that checks the binding)

### Invariants that must remain true

- All existing tests pass (no regression)
- The `__freeOperation` binding is always present in effect context (never undefined)
- Non-operation actions (simple actions) are unaffected -- they don't use operation profiles
- The binding does not collide with game-designer bindings (reserved prefix `__`)
- Effect context construction remains immutable (no mutation of existing bindings object)
