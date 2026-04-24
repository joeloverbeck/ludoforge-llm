# Card-Driven Terminal Authoring

This document names generic authoring conventions for card-driven terminal
conditions in `GameSpecDoc` YAML. These conventions use existing declarative
DSL primitives only; they do not add engine keywords or game-specific runtime
logic.

## Future-Stream Class-Filter Pattern

Use the Future-Stream Class-Filter Pattern for terminal conditions that depend
on exhausting a class of future cards, such as "no future coup cards remain" or
"no future monsoon cards remain".

The canonical production witness is Fire in the Lake's
`final-coup-ranking` checkpoint at
`data/games/fire-in-the-lake/90-terminal.md:273-315`. That checkpoint counts
coup cards with `tokensInZone(..., filter: { prop: isCoup, op: eq, value: true })`
in the played card zone and every future-stream zone.

### Rules

1. Gate the checkpoint with `phases: [<every-phase-where-the-boundary-can-arise>]`.
   Include any phase where the boundary may arise because a coup round, scoring
   round, or equivalent special round is suppressed.
2. Express "no future X cards remain" by counting matching tokens across every
   future-stream zone, typically `lookahead:*` and `deck:*`, with
   `tokensInZone(<zone>, filter: { <class-predicate> })`.
3. Express "the currently played card is the final X" by counting matching
   tokens in the played zone, typically `played:*`, with the same class filter.

### Anti-Pattern

Do not encode a campaign-end boundary as a single-phase gate plus a single-zone
emptiness check. That was the pre-FITLDETBOUND-001 bug: the final coup could be
the current card while ordinary non-coup event cards still remained in the
future stream, and the boundary could arise in `main` when the coup round was
suppressed. Zone emptiness is not the same as class exhaustion.

### Regression Witnesses

The existing FITL regressions preserve the production behavior:

- `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153`
  resolves final-coup ranking after `coupRedeploy` when no future coup cards
  remain.
- `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:197`
  resolves final-coup ranking in `main` when the last coup is played without a
  coup round.

`142CARDENDS-002` adds the forward generic, non-FITL regression for this same
pattern at
`packages/engine/test/unit/terminal-future-stream-class-filter.test.ts`.
