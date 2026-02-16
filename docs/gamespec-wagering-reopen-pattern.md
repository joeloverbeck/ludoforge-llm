# GameSpec Pattern: Reopen Semantics for Wagering Rounds

## Purpose

Define poker-style betting-round reopen behavior in `GameSpecDoc` YAML without kernel specialization:

- Full raises reopen action.
- Short all-in raises do not reopen raise rights.
- Preflop big-blind option remains open only in the unraised blind state.

## Canonical State Contract

Use one per-player boolean:

- `actedSinceLastFullRaise: boolean`

Reset policy:

- Reset for live seats at each new street.
- Reset for eligible actors when a full raise occurs.
- Set `true` for the actor after any action they take in the street.

## Canonical Action Guards

`raise` and `allIn` preconditions should include:

- `actedSinceLastFullRaise == false`

`call`/`check` remain legal by standard bet-matching rules. They set:

- `actedSinceLastFullRaise = true` for the acting player.

## Full Raise vs Short All-In

When resolving `allIn`:

1. If resulting `streetBet <= currentBet`: no raise, no reopen.
2. If resulting `streetBet > currentBet`:
- always set `currentBet` to new `streetBet`.
- only treat as full raise if `(streetBet - prevCurrentBet) >= prevLastRaiseSize`.
- on full raise, update `lastRaiseSize` and reset reopen state for eligible actors.

## Preflop BB Option Guard

The special preflop BB-option hold-open branch must include:

- `currentBet == bigBlind`

This prevents the BB-option rule from persisting after any raise sequence.

## Why This Pattern

- Keeps engine generic and game-agnostic.
- Encodes wagering policy in YAML where game rules belong.
- Reusable across poker-like variants and other wagering round systems.
