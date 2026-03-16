---
name: Capability Card Test Process
description: When writing dedicated event tests for FITL capability cards, read the YAML profile first and use makeIsolatedInitialState for capability tests
type: feedback
---

When writing tests for FITL capability cards (like Main Force Bns), always read the actual YAML action profile BEFORE writing capability mechanical tests. Plan interpretations of card text often diverge from the actual YAML implementation (e.g., "threshold change" vs "max activation count", "1 space enhanced" vs "all spaces enhanced").

**Why:** During card-104 implementation, the plan interpreted unshaded as a threshold change (>1 vs >3) but the YAML uses `maxActivatedGuerrillas: 99 vs 1`. The plan interpreted shaded Ambush as 1-space enhancement but the YAML applies `removalBudgetExpr=2` to ALL spaces. This caused 5 test failures that required rewriting.

**How to apply:**
1. Before writing capability mechanical tests, grep for the marker name in `data/games/fire-in-the-lake/30-rules-actions.md` and read the relevant profile YAML
2. Use `makeIsolatedInitialState` (from `isolated-state-helpers`) for capability tests — it clears zones. Do NOT use the inline `operationInitialState` pattern (which doesn't clear zones) unless you specifically need default game tokens
3. Capability effects often have multiple interacting parameters in the macro chain (e.g., `maxActivatedGuerrillas` is separate from the activation threshold). Tests must satisfy ALL preconditions, not just the one the capability modifies
