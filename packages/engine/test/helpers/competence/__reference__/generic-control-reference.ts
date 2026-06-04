import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../../../src/agents/index.js';
import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../../../src/cnl/index.js';
import {
  assertValidatedGameDef,
  type Agent,
  type ValidatedGameDef,
} from '../../../../src/kernel/index.js';
import type {
  OutcomeDeltaAssertion,
  PreviewCandidateExpectation,
} from '../index.js';
import { runToCompetenceDecision, type CompetenceRunResult } from '../index.js';

export interface GenericControlCompetenceReference {
  readonly def: ValidatedGameDef;
  readonly run: () => CompetenceRunResult;
  readonly outcomeDeltaAssertions: readonly OutcomeDeltaAssertion[];
  readonly trapStableMoveKeys: readonly string[];
  readonly previewCandidates: readonly PreviewCandidateExpectation[];
}

export const createGenericControlCompetenceReference = (): GenericControlCompetenceReference => {
  const def = compileGenericControl();
  return {
    def,
    run: () => runGenericControl(def),
    outcomeDeltaAssertions: [
      {
        label: 'generic-control round advances',
        query: { kind: 'globalVar', name: 'round' },
        delta: { exact: 1 },
      },
      {
        label: 'generic-control active player score increases',
        query: { kind: 'perPlayerVar', playerId: 0, name: 'controlScore' },
        delta: { exact: 1 },
      },
      {
        label: 'generic-control claimed zone controller changes',
        query: { kind: 'zoneVar', zoneId: 'north:none', name: 'controller' },
        after: 0,
        delta: { exact: 1 },
      },
    ],
    trapStableMoveKeys: ['pass|{}|false|unclassified'],
    previewCandidates: [
      {
        stableMoveKey: 'claim|{"targetZone":"north:none"}|false|unclassified',
        selectionReason: 'prior',
      },
      {
        stableMoveKey: 'pass|{}|false|unclassified',
        selectionReason: 'prior',
      },
    ],
  };
};

const compileGenericControl = (): ValidatedGameDef => {
  const entrypoint = join(resolveRepoRoot(), 'data', 'games', 'generic-control.game-spec.md');
  const staged = runGameSpecStagesFromBundle(loadGameSpecBundleFromEntrypoint(entrypoint));
  const compileResult = staged.compilation.result;
  const gameDef = compileResult?.gameDef;

  if (
    staged.validation.blocked
    || staged.compilation.blocked
    || compileResult === null
    || gameDef === undefined
    || gameDef === null
  ) {
    throw new Error('generic-control reference fixture failed to compile');
  }
  if (staged.validation.diagnostics.length > 0 || compileResult.diagnostics.length > 0) {
    throw new Error('generic-control reference fixture compiled with diagnostics');
  }

  return assertValidatedGameDef(gameDef);
};

const resolveRepoRoot = (): string => {
  let cursor = fileURLToPath(new URL('.', import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  throw new Error('Unable to resolve repository root for generic-control competence reference.');
};

const createGenericControlAgents = (): readonly Agent[] =>
  [new PolicyAgent({ traceLevel: 'verbose' }), new PolicyAgent({ traceLevel: 'verbose' })];

const runGenericControl = (def: ValidatedGameDef): CompetenceRunResult =>
  runToCompetenceDecision({
    def,
    seed: 209,
    agents: createGenericControlAgents(),
    playerCount: 2,
    maxTurns: 3,
    microturnBound: 20,
    advanceUntil: ({ microturn }) =>
      microturn.kind === 'actionSelection' && microturn.legalActions.length > 1,
  });
