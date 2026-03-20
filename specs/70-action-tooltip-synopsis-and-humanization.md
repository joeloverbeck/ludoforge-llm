# Spec 70 — Action Tooltip Synopsis & Humanization Fixes

## Problem

The action tooltip system has two visible defects in the runner UI:

1. **Synopsis repeats first step instead of showing authored summary.** The tooltip header shows raw AST content like `"Rally — Select up to 1 zone Category in expr(scalarArray) and Support/Opposition of Zone is not Passive Support..."` instead of a concise summary. Authored summaries exist in verbalization macros (e.g., `rally-nva-profile: summary: "Place NVA forces and build bases"`), and the normalizer already emits `SummaryMessage` IR nodes from them, but `findSynopsisSource()` only matches `select`/`choose` messages — it ignores `summary` messages.

2. **`expr(scalarArray)` appears in tooltip text.** The `scalarArray` discriminant (`{ scalarArray: ['city', 'province'] }`) is a valid `ValueExpr` shape used in zone selector filters, but both `stringifyValueExpr` and `humanizeValueExpr` in `tooltip-value-stringifier.ts` lack a handler for it, falling through to the debug fallback `expr(keys.join(', '))`.

## Foundations Alignment

- **F1 Engine Agnosticism**: All changes are generic — no game-specific logic in engine code. Summaries live in per-game verbalization YAML.
- **F2 Evolution-First**: `actionSummaries` is YAML data in GameSpecDoc, evolvable by LLMs.
- **F4 Schema Ownership Stays Generic**: `VerbalizationDef` type is extended generically with `actionSummaries?: Record<string, string>`, not per-game.
- **F7 Immutability**: No mutation — all tooltip pipeline functions remain pure.
- **F10 Architectural Completeness**: Addresses root causes (missing discriminant handler, synopsis source priority), not symptoms.
- **F11 Testing as Proof**: Unit and integration tests prove both fixes.

## Design

### Part A: scalarArray Humanization (Bug Fix)

**Problem**: `{ scalarArray: ['city', 'province'] }` falls through to `expr(scalarArray)`.

**Fix**: Add `scalarArray` branch to both stringification functions.

**File**: `packages/engine/src/kernel/tooltip-value-stringifier.ts`

In `stringifyValueExpr` (before the final fallback at line ~302):
```typescript
if ('scalarArray' in expr) {
  const items = expr.scalarArray as readonly ScalarValue[];
  return items.map(String).join(' or ');
}
```

In `humanizeValueExpr` (before the final fallback at line ~416):
```typescript
if ('scalarArray' in expr) {
  const items = expr.scalarArray as readonly ScalarValue[];
  return items.map((item) => resolveLabel(String(item), ctx, count)).join(' or ');
}
```

**Expected result**: `"City or Province"` instead of `"expr(scalarArray)"`.

### Part B: Synopsis from Authored Summaries

#### B1. Extend VerbalizationDef with actionSummaries

**File**: `packages/engine/src/kernel/verbalization-types.ts`

Add optional field to `VerbalizationDef`:
```typescript
export interface VerbalizationDef {
  // ... existing fields ...
  readonly actionSummaries?: Readonly<Record<string, string>>;
}
```

**File**: verbalization compilation/parsing (wherever `VerbalizationDef` is constructed from YAML)

Accept the new `actionSummaries` key from the verbalization YAML block and pass it through to the compiled `VerbalizationDef`.

#### B2. Emit SummaryMessage for action-level summaries

**File**: `packages/engine/src/kernel/tooltip-normalizer.ts` (or the entry point that produces `TooltipMessage[]` for an action)

At the start of tooltip message generation for an action, check if `verbalization.actionSummaries?.[actionId]` exists. If so, prepend a `SummaryMessage`:
```typescript
if (ctx.verbalization.actionSummaries?.[actionId] !== undefined) {
  messages.unshift({
    kind: 'summary',
    text: ctx.verbalization.actionSummaries[actionId],
    astPath: `action:${actionId}`,
  });
}
```

This runs BEFORE macro-level summary detection, ensuring action-level summaries take priority for non-macro actions. Macro-originated actions (profiles) already have summaries from their existing macro lookup path.

#### B3. Update findSynopsisSource to prefer summary messages

**File**: `packages/engine/src/kernel/tooltip-content-planner.ts`

Change `findSynopsisSource` from:
```typescript
function findSynopsisSource(messages: readonly TooltipMessage[]): TooltipMessage | undefined {
  return messages.find((m) => m.kind === 'select' || m.kind === 'choose');
}
```

To:
```typescript
function findSynopsisSource(messages: readonly TooltipMessage[]): TooltipMessage | undefined {
  // Prefer authored summary over auto-generated select/choose synopsis
  const summary = messages.find((m) => m.kind === 'summary');
  if (summary !== undefined) return summary;
  return messages.find((m) => m.kind === 'select' || m.kind === 'choose');
}
```

**File**: `packages/engine/src/kernel/tooltip-template-realizer.ts`

Update `realizeSynopsis` to handle `summary` kind:
```typescript
const realizeSynopsis = (plan: ContentPlan, ctx: LabelContext): string => {
  const label = resolveLabel(plan.actionLabel, ctx);
  if (plan.synopsisSource !== undefined) {
    if (plan.synopsisSource.kind === 'summary') {
      return `${label} — ${plan.synopsisSource.text}`;
    }
    const detail = realizeMessage(plan.synopsisSource, ctx);
    return `${label} — ${detail}`;
  }
  return label;
};
```

### Part C: Author Summaries for All Actions

#### FITL actionSummaries

**File**: `data/games/fire-in-the-lake/05-verbalization.md`

Add `actionSummaries` section to the verbalization YAML block:

```yaml
actionSummaries:
  # ── Coup Round Actions ──────────────────────────────────────────────
  coupVictory: "Check faction victory conditions"
  coupResources: "Resolve resource earnings and aid"
  coupSupport: "Pacify or agitate population support"
  coupRedeploy: "Redeploy forces during coup round"
  coupCommitment: "Adjust US commitment level"
  coupReset: "Reset eligibility and advance card"
  coupVictoryCheck: "Evaluate victory thresholds"
  coupResourcesResolve: "Calculate and distribute resources"
  coupPacifyPass: "Pass on pacification"
  coupAgitatePass: "Pass on agitation"
  coupPacifyUS: "US pacifies selected spaces"
  coupPacifyARVN: "ARVN pacifies selected spaces"
  coupAgitateVC: "VC agitates selected spaces"
  coupArvnRedeployMandatory: "ARVN mandatory redeployment"
  coupArvnRedeployOptionalTroops: "ARVN optional troop redeployment"
  coupArvnRedeployPolice: "ARVN police redeployment"
  coupNvaRedeployTroops: "NVA troop redeployment"
  coupRedeployPass: "Pass on redeployment"
  coupCommitmentPass: "Pass on commitment change"
  coupCommitmentResolve: "Resolve commitment adjustment"

  # ── Event Actions ───────────────────────────────────────────────────
  pivotalEvent: "Execute pivotal event card"

  # ── Resource Transfer Actions ───────────────────────────────────────
  nvaTransferResources: "NVA transfers resources to VC"
  vcTransferResources: "VC transfers resources to NVA"

  # ── Commitment & Pacification ───────────────────────────────────────
  commitment: "Set US commitment level"
  resolveCommitment: "Resolve commitment phase"
  honoluluPacify: "Execute Honolulu conference pacification"
  resolveHonoluluPacify: "Resolve Honolulu pacification"
  apcPacify: "Execute APC pacification"
  apcPacifyUS: "US APC pacification"
  apcPacifyARVN: "ARVN APC pacification"
  apcPacifyPass: "Pass on APC pacification"
  resolveApcPacify: "Resolve APC pacification"

  # ── Lifecycle Triggers ──────────────────────────────────────────────
  on-coup-support-enter: "Initialize coup support phase"
  on-honolulu-pacify-enter: "Initialize Honolulu pacification"
  on-apc-pacify-enter: "Initialize APC pacification"
  on-coup-redeploy-enter: "Initialize coup redeployment"
  on-coup-reset-enter: "Initialize coup reset"
  mom-adsid-on-trail-change: "ADSID trail change response"
```

Note: The exact action IDs and summary texts must be verified against the actual action definitions in `data/games/fire-in-the-lake/30-rules-actions.md`. The above is a starting point — the implementer must grep for all action IDs and cross-reference with FITL rules reports for accuracy.

#### Texas Hold'em actionSummaries

**File**: `data/games/texas-holdem/05-verbalization.md`

Add `actionSummaries` section:

```yaml
actionSummaries:
  fold: "Surrender hand and forfeit current bets"
  check: "Pass without adding chips to the pot"
  call: "Match the current bet to stay in the hand"
  raise: "Increase the current bet"
  allIn: "Bet all remaining chips"
```

## Testing

### Unit tests for Part A (scalarArray)

**File**: new test in appropriate tooltip test directory

```
- stringifyValueExpr({ scalarArray: ['city', 'province'] }) === 'city or province'
- stringifyValueExpr({ scalarArray: [1, 2, 3] }) === '1 or 2 or 3'
- stringifyValueExpr({ scalarArray: ['single'] }) === 'single'
- humanizeValueExpr({ scalarArray: ['city', 'province'] }, ctx) resolves labels
```

### Unit tests for Part B (synopsis priority)

**File**: tooltip-content-planner tests

```
- findSynopsisSource with summary + select messages → returns summary
- findSynopsisSource with only select messages → returns select (backward compat)
- findSynopsisSource with only summary messages → returns summary
- findSynopsisSource with no summary or select → returns undefined
```

### Integration test

```
- Compile FITL rally-nva-profile → generate tooltip → verify RuleCard synopsis contains "Place NVA forces and build bases"
- Compile Texas Hold'em fold → generate tooltip → verify RuleCard synopsis contains "Surrender hand and forfeit current bets"
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-value-stringifier.ts` | Add scalarArray branch to both functions |
| `packages/engine/src/kernel/verbalization-types.ts` | Add `actionSummaries` to VerbalizationDef |
| `packages/engine/src/kernel/tooltip-content-planner.ts` | Update findSynopsisSource to prefer summary |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Handle summary kind in realizeSynopsis |
| `packages/engine/src/kernel/tooltip-normalizer.ts` | Emit SummaryMessage from actionSummaries |
| Verbalization compilation code | Accept actionSummaries from YAML |
| `data/games/fire-in-the-lake/05-verbalization.md` | Add actionSummaries section |
| `data/games/texas-holdem/05-verbalization.md` | Add actionSummaries section |
| Test files (new/extended) | scalarArray, synopsis priority, integration |

## Out of Scope

- Changing the ActionTooltip React component (it already renders synopsis correctly)
- Refactoring the tooltip pipeline architecture
- Adding summaries to event cards or triggers
- Visual styling changes to the tooltip
