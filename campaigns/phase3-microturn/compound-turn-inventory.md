# Spec 140 Compound-Turn Inventory

`packages/engine/test/fixtures/spec-140-compound-turn-shapes/fitl-actions.json` is the checked-in FITL design witness for Spec 140 I1. It was derived from the live compiled FITL `GameDef`, not from a hand-maintained action list, so the inventory stays aligned with both core action pipelines and chooser-bearing event-card sides.

## What The Fixture Covers

- `29` chooser-bearing action pipelines under `compiled.gameDef.actionPipelines`
- `86` chooser-bearing event-card sides under `compiled.gameDef.eventDecks[*].cards[*].{unshaded,shaded}`
- `115` total compound-turn surfaces
- `387` total published decision frames across those surfaces

Each inventory entry captures:

- the authoritative source surface (`pipeline:<id>` or `event:<card-id>:<side>`)
- the published microturn sequence shape in encounter order
- the turn-retirement boundary after the final decision frame
- an explicit empty `reactionInterruptBoundaries` list for now

The fixture intentionally records *shape*, not live option instances. `optionsAtPublication` and `legalActionCount` are descriptive summaries meant to validate that every chooser-bearing FITL surface is representable as a deterministic stack of decision frames.

## Surprising Shapes

`march-nva-profile` is the clearest proof that a stack model is required. The live compiled shape is not just `chooseN(targetSpaces)` followed by one movement resolution. It branches into per-destination resolution, then conditionally opens trail-chain destination selection plus nested `chooseN` frames for continuing guerrillas and troops. A flat move-completion view hides how many resumable frames are actually in flight.

`train-us-profile` is the densest core operation witness in the current corpus. Its sequence includes destination selection, nested `chooseOne` branching for the train mode, optional cube-type selection, capability-driven bonus-police choice points, sub-action space selection, and downstream pacify / transfer choices. This is the strongest action-pipeline argument for keeping suspend/resume state in the kernel instead of trying to reconstruct it in the runner.

`assault-us-profile`, `infiltrate-profile`, and both ambush profiles confirm that the hard cases are not limited to `march`. Capability-triggered stochastic nodes (`rollRandom` mapped here as `chooseStochastic`) and piece-removal ordering choices appear inside already-nested control flow.

The event deck is even broader than the initial draft wording suggested. The compiled FITL surface currently contains `86` event-card sides with chooser-bearing flows, so “event-card-driven action” needs to be read literally as the live card-side execution surface, not only as a narrow set of named operation follow-ons.

## Design Takeaways For Spec 140

- The inventory does not expose any live FITL surface that obviously falls outside a `DecisionStackFrame[]` representation.
- `chooseN` needs a resumable sub-frame model rather than a one-shot aggregate binding. Many surfaces reopen `chooseN` inside `forEach` loops or capability-conditioned branches.
- Stochastic resolution can be modeled as another published frame kind without special casing the rest of the suspension machinery. In the fixture, `rollRandom` surfaces are represented as `chooseStochastic`.
- Action ids in the draft ticket needed one correction against the live repo: FITL uses canonical action ids such as `terror`, `ambushNva`, and `ambushVc` rather than the prose labels `operation-terror` or a single generic `operation-ambush`.

## Validation Strategy

`packages/engine/test/fixtures/spec-140-compound-turn-shapes/validate.ts` performs two checks:

- schema conformance for every JSON entry and every microturn step
- exact coverage parity between the fixture and the live compiled FITL surfaces

That second check is the key guardrail for downstream Spec 140 tickets. If FITL adds or removes a chooser-bearing compound-turn surface, the fixture will fail closed instead of silently drifting.
