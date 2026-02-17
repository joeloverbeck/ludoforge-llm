# PIXIFOUND-001: Add PixiJS v8 Dependencies to Runner Package

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: Prerequisite for all D1–D14
**Priority**: P0
**Depends on**: None
**Blocks**: PIXIFOUND-002 through PIXIFOUND-015

---

## Objective

Install PixiJS v8, pixi-viewport v6, and @pixi/react v8 into the runner package. Verify versions are compatible and the runner still builds cleanly.

---

## Files to Touch

- `packages/runner/package.json` — add `pixi.js`, `pixi-viewport`, `@pixi/react` to dependencies
- `pnpm-lock.yaml` — auto-updated by `pnpm install`

---

## Out of Scope

- **No source files created or modified** — this ticket is deps-only.
- Do NOT modify `packages/engine/` or any engine code.
- Do NOT add PixiJS type augmentations or custom type declarations.
- Do NOT modify `vite.config.ts` or `tsconfig.json` unless required for resolution.
- Do NOT create any canvas source files (those are PIXIFOUND-005+).

---

## Implementation Details

Add to `packages/runner/package.json` dependencies:

```json
{
  "pixi.js": "^8.2.0",
  "pixi-viewport": "^6.0.1",
  "@pixi/react": "^8.0.0"
}
```

Run `pnpm install` to update the lockfile. Then verify:
1. `pnpm -F @ludoforge/runner build` succeeds.
2. `pnpm -F @ludoforge/runner typecheck` succeeds.
3. `pnpm -F @ludoforge/runner test` passes (existing tests unaffected).

---

## Acceptance Criteria

### Tests that must pass
- All existing runner tests: `pnpm -F @ludoforge/runner test`
- All existing engine tests: `pnpm -F @ludoforge/engine test`

### Invariants that must remain true
- Runner builds without errors: `pnpm -F @ludoforge/runner build`
- Runner typechecks without errors: `pnpm -F @ludoforge/runner typecheck`
- No changes to any source files outside `package.json` / lockfile.
- Exact versions locked in `pnpm-lock.yaml` match the `^` ranges above.
