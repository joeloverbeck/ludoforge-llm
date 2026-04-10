import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyMove,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
} from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type VerbosePolicyCandidate = NonNullable<
  NonNullable<Extract<ReturnType<PolicyAgent['chooseMove']>['agentDecision'], { kind: 'policy' }>['candidates']>[number]
>;

const WITNESS_MAX_SEED = 20;
const WITNESS_MAX_PLY = 30;

interface CardWitness {
  readonly def: ReturnType<typeof assertValidatedGameDef>;
  readonly result: ReturnType<PolicyAgent['chooseMove']>;
  readonly seed: number;
  readonly ply: number;
}

/**
 * Search across seeds and plies for a decision point where the specified card
 * has candidates matching the given predicate. This decouples the test from
 * specific game trajectories that depend on evolving agent profiles.
 */
function findCardWitness(
  cardId: string,
  predicate: (candidates: readonly VerbosePolicyCandidate[]) => boolean,
): CardWitness {
  for (let seed = 1; seed <= WITNESS_MAX_SEED; seed += 1) {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const agents = Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'verbose' }));
    let state = initialState(def, seed, 4).state;

    for (let ply = 0; ply <= WITNESS_MAX_PLY; ply += 1) {
      const legalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
      const result = agents[Number(state.activePlayer)]!.chooseMove({
        def,
        state,
        playerId: state.activePlayer,
        legalMoves,
        rng: createRng(BigInt(seed * 1000 + ply)),
        runtime,
      });

      if (result.agentDecision?.kind === 'policy' && result.agentDecision.candidates !== undefined) {
        const cardCandidates = result.agentDecision.candidates.filter(
          (candidate) => candidate.actionId === 'event' && candidate.stableMoveKey.includes(`"eventCardId":"${cardId}"`),
        );
        if (cardCandidates.length > 0 && predicate(cardCandidates)) {
          return { def, result, seed, ply };
        }
      }

      state = applyMove(def, state, result.move, undefined, runtime).state;
    }
  }

  assert.fail(
    `Expected a bounded witness for card "${cardId}" within seeds 1-${WITNESS_MAX_SEED} and plies 0-${WITNESS_MAX_PLY}`,
  );
}

function requireVerboseCandidates(result: ReturnType<PolicyAgent['chooseMove']>): readonly VerbosePolicyCandidate[] {
  assert.equal(result.agentDecision?.kind, 'policy');
  if (result.agentDecision?.kind !== 'policy') {
    assert.fail('expected policy trace metadata');
  }
  if (result.agentDecision.candidates === undefined) {
    assert.fail('expected verbose policy candidates');
  }
  return result.agentDecision.candidates;
}

function candidatesForCard(
  candidates: readonly VerbosePolicyCandidate[],
  cardId: string,
): readonly VerbosePolicyCandidate[] {
  return candidates.filter(
    (candidate) => candidate.actionId === 'event' && candidate.stableMoveKey.includes(`"eventCardId":"${cardId}"`),
  );
}

function candidatesForParam(
  candidates: readonly VerbosePolicyCandidate[],
  key: string,
  value: string,
): readonly VerbosePolicyCandidate[] {
  return candidates.filter((candidate) => candidate.stableMoveKey.includes(`"${key}":"${value}"`));
}

function projectedSelfMarginContribution(candidate: VerbosePolicyCandidate): number {
  const scoreContributions = candidate.scoreContributions;
  if (scoreContributions === undefined) {
    assert.fail(`expected score contributions for ${candidate.stableMoveKey}`);
  }
  const contribution = scoreContributions.find((entry) =>
    /[Mm]argin/.test(entry.termId),
  );
  assert.notEqual(contribution, undefined, `expected margin contribution for ${candidate.stableMoveKey}`);
  return contribution!.contribution;
}

function uniqueProjectedValues(candidates: readonly VerbosePolicyCandidate[]): number[] {
  return [...new Set(candidates.map(projectedSelfMarginContribution))].sort((left, right) => left - right);
}

describe('FITL production event preview differentiation', () => {
  it('honestly limits Green Berets template-phase candidates to the legal side at the decision point', () => {
    const witness = findCardWitness('card-68', (candidates) => {
      const shaded = candidates.filter((c) => c.stableMoveKey.includes('"side":"shaded"'));
      const unshaded = candidates.filter((c) => c.stableMoveKey.includes('"side":"unshaded"'));
      return shaded.length === 0 && unshaded.length > 0 && unshaded.every((c) => c.previewOutcome === 'ready');
    });
    const candidates = candidatesForCard(requireVerboseCandidates(witness.result), 'card-68');
    const shaded = candidatesForParam(candidates, 'side', 'shaded');
    const unshaded = candidatesForParam(candidates, 'side', 'unshaded');

    assert.equal(shaded.length, 0, 'expected no shaded Green Berets candidates at this decision point');
    assert.equal(unshaded.length > 0, true, 'expected unshaded Green Berets candidates');
    assert.equal(unshaded.every((candidate) => candidate.previewOutcome === 'ready'), true);
  });

  it('surfaces Green Berets branches independently with Phase 1 preview ready', () => {
    const witness = findCardWitness('card-68', (candidates) => {
      const irregulars = candidates.filter((c) => c.stableMoveKey.includes('"branch":"place-irregulars-and-support"'));
      const rangers = candidates.filter((c) => c.stableMoveKey.includes('"branch":"place-rangers-and-support"'));
      return irregulars.length > 0 && rangers.length > 0
        && irregulars.every((c) => c.previewOutcome === 'ready')
        && rangers.every((c) => c.previewOutcome === 'ready');
    });
    const candidates = candidatesForCard(requireVerboseCandidates(witness.result), 'card-68');
    const irregularsBranch = candidatesForParam(candidates, 'branch', 'place-irregulars-and-support');
    const rangersBranch = candidatesForParam(candidates, 'branch', 'place-rangers-and-support');

    assert.equal(irregularsBranch.length > 0, true, 'expected Green Berets irregulars branch candidates');
    assert.equal(rangersBranch.length > 0, true, 'expected Green Berets rangers branch candidates');
    assert.equal(irregularsBranch.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.equal(rangersBranch.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.equal(
      new Set(candidates.map((candidate) => candidate.stableMoveKey)).size,
      candidates.length,
      'expected Green Berets branches to remain distinct candidates in the template-phase trace',
    );
  });

  it('honestly keeps Cadres capability previews ready even when immediate projected margin stays equal', () => {
    const witness = findCardWitness('card-116', (candidates) => {
      const shaded = candidates.filter((c) => c.stableMoveKey.includes('"side":"shaded"'));
      const unshaded = candidates.filter((c) => c.stableMoveKey.includes('"side":"unshaded"'));
      return shaded.length === 1 && unshaded.length === 1 && candidates.every((c) => c.previewOutcome === 'ready');
    });
    const card = witness.def.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-116');
    const candidates = candidatesForCard(requireVerboseCandidates(witness.result), 'card-116');
    const shaded = candidatesForParam(candidates, 'side', 'shaded');
    const unshaded = candidatesForParam(candidates, 'side', 'unshaded');

    assert.equal(card?.tags?.includes('capability'), true, 'expected card-116 to remain a capability card in production data');
    assert.equal(shaded.length, 1, 'expected exactly one shaded Cadres candidate');
    assert.equal(unshaded.length, 1, 'expected exactly one unshaded Cadres candidate');
    assert.equal(candidates.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.deepEqual(
      uniqueProjectedValues(candidates),
      [projectedSelfMarginContribution(candidates[0]!)],
      'expected capability preview honesty when immediate projected margin does not diverge',
    );
  });
});
