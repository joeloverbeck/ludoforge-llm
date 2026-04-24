# Spec 144 I3 Pass-Action Audit

Date: 2026-04-24

Scope: conformance-corpus fallback actions used by the Spec 144 rollback safety net.

## Engine Predicate

The engine-side fallback predicate is generic:

```ts
action.tags?.includes('pass')
```

The engine does not hard-code game ids, action ids, factions, or rule branches. A fallback action must still pass the normal authored legality/applicability pipeline and is published as a normal `actionSelection` decision.

## Corpus Classification

| Game | Fallback action | Source | Tags after audit | Applicability | Decision |
| --- | --- | --- | --- | --- | --- |
| Fire in the Lake | `pass` | `data/games/fire-in-the-lake/30-rules-actions.md:159` | `[pass]` | Main phase, active faction, no params, no authored effects today | Already conforms. |
| Texas Hold'em | `check` | `data/games/texas-holdem/30-rules-actions.md:258` | `[check, pass]` | Betting phases, active player, only when `streetBet == currentBet` | Updated to carry the generic pass tag. |
| Texas Hold'em | `fold` | `data/games/texas-holdem/30-rules-actions.md:243` | `[fold]` | Betting phases, active player | Not tagged as pass; surrender is not the generic no-bet pass fallback. |

Texas Hold'em's verbalization already describes `check` as "Pass without adding chips to the pot" in `data/games/texas-holdem/05-verbalization.md:56`. Adding `pass` to `check` keeps fallback semantics in authored GameSpecDoc data (Foundations #2 and #7) while preserving engine agnosticism (Foundations #1). `fold` remains fold-only because making surrender the generic pass fallback would be a semantic rule change and could cause the fallback to select fold where check is the rule-faithful no-bet pass.

## Grant-Clearing Decision

Rollback does not synthesize a grant-clearing effect and does not modify FITL's `pass` action in this ticket.

Decision: path (c), grant harmlessly expires at turn retirement, with the important implementation detail that rollback restores the nearest existing `actionSelection` frame rather than inventing a new action or clearing `turnOrderState.runtime.pendingFreeOperationGrants`. The fallback pass action still runs through the normal apply pipeline. If a future game needs explicit grant termination, that belongs in authored GameSpecDoc data or in a separate generic grant-lifecycle rule, not in a FITL-specific rollback branch.

This is safe for the current rollback use case because the blacklisted action is skipped before it is re-applied, and the pass/check fallback is a normal authored action. Any still-pending free-operation grant remains part of the state until the normal turn lifecycle advances or expires it.
