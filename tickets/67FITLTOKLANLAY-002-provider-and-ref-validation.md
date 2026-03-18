# 67FITLTOKLANLAY-002: VisualConfigProvider Resolution APIs and Visual-Config Ref Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner config/provider only
**Deps**: 67FITLTOKLANLAY-001

## Problem

After the schema exists, the runner still lacks a single resolution path for Spec 67. `VisualConfigProvider` currently resolves only token shape/color/size/symbols and basic zone visuals; it cannot answer “what token lane does this token use?”, “what token layout applies to this zone?”, or “how should the stack badge be styled?”. The repo also already has a reference-validation layer, and Spec 67 needs fast failures for bad lane assignments instead of silently rendering nonsense.

## Assumption Reassessment (2026-03-18)

1. [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) is already the central resolver for runtime visual decisions — confirmed.
2. [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) already owns cross-reference checks that require real `GameDef` ids — confirmed.
3. `packages/runner/test/config/visual-config-provider.test.ts` and `packages/runner/test/config/validate-visual-config-refs.test.ts` are the right places to lock down provider behavior and bad-reference failures — confirmed.

## Architecture Check

1. Provider APIs keep lane resolution, token presentation, and badge styling out of the renderer and out of YAML-call-site code.
2. Cross-reference validation belongs in `validate-visual-config-refs.ts`, not in the renderer, because it needs real zone/token context and should fail before any canvas rendering begins.
3. This ticket must preserve the Spec 67 “single resolution path” principle: consumers ask the provider, not raw config objects.

## What to Change

### 1. Add resolved provider types and APIs

Extend [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts) so it can resolve:

- token presentation metadata for a token type
- stack badge style
- zone token layout for a given zone id/category

The resolved types should be explicit and normalized, not raw YAML fragments.

### 2. Keep `ResolvedTokenVisual` and presentation metadata coherent

Choose one of these clean approaches and document it in the implementation:

1. expand `ResolvedTokenVisual` to include presentation data
2. introduce a sibling `ResolvedTokenPresentation`
3. introduce a composite resolved token visual object used consistently by renderer code

Recommendation: option 2 or 3, so shape/color/size concerns stay distinct from layout-policy metadata.

### 3. Add cross-reference validation for Spec 67 config

Extend [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) so invalid references fail before runtime, including:

- zone token layout assignments that reference unknown zone categories or preset ids, if applicable to the chosen contract
- token presentation lanes that do not exist in the lane layout used by their assigned map-space categories
- any preset references that cannot resolve from the visual config

Use the existing validation error pattern instead of custom throw sites in the renderer.

### 4. Add focused provider and validation tests

Extend:

- [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts)
- [`packages/runner/test/config/validate-visual-config-refs.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/validate-visual-config-refs.test.ts)

Tests should cover both happy-path resolution and the new fast-fail validation cases.

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify)

## Out of Scope

- token renderer placement logic
- `GameCanvas` data plumbing
- FITL `visual-config.yaml`
- screenshot capture or screenshot artifact updates
- any engine/runtime/kernel/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/config/visual-config-provider.test.ts` verifies a FITL-style map-space category resolves to the two-lane preset.
2. `packages/runner/test/config/visual-config-provider.test.ts` verifies base tokens resolve `lane: base` and `scale: 1.5`, while regular force tokens resolve `lane: regular`.
3. `packages/runner/test/config/visual-config-provider.test.ts` verifies stack badge style resolves from config with normalized defaults where needed.
4. `packages/runner/test/config/validate-visual-config-refs.test.ts` fails when a token presentation lane cannot be satisfied by the zone token layout contract.
5. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config-provider.test.ts validate-visual-config-refs.test.ts`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `VisualConfigProvider` remains the only runtime source of resolved token presentation/layout/badge metadata.
2. Validation failures happen before rendering; the renderer does not contain fallback guesses for malformed config.
3. No FITL-specific branching is introduced into provider logic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` — token presentation resolution, lane preset resolution, stack badge resolution
2. `packages/runner/test/config/validate-visual-config-refs.test.ts` — invalid preset references and invalid token lane usage

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-provider.test.ts validate-visual-config-refs.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

