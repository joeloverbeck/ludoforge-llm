# Policy Probe Runner

This directory contains the Phase 0 scaffold for deterministic policy probes.
Probe modules define a small data object with `defineProbe()`, then a per-game
`*.probes.test.ts` wrapper loads the game fixture and calls `runProbe()`.

The runner drives the normal kernel and policy-agent path:

1. create initial state for the probe seed,
2. apply any `stateBinding.replayPrefix` with public kernel decision application,
3. publish microturns and let `PolicyAgent` choose through the configured profile,
4. collect the selected decision plus `PolicyAgentDecisionTrace`,
5. return deterministic per-seed and aggregate outcomes.

This ticket intentionally keeps `ProbeAssertion` as an empty union. Assertion
kinds and concrete game probes land in follow-up tickets.

Minimal wrapper shape:

```ts
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { runProbe } from './probe-runner.js';
import { probes } from './fire-in-the-lake/example.probe.js';

describe('fire-in-the-lake policy probes', () => {
  for (const probe of probes) {
    it(probe.id, () => {
      const result = runProbe(probe, {
        loadGame: ({ scenario }) => {
          const def = getFitlProductionFixture().gameDef;
          return { def, runtime: createGameDefRuntime(def), playerCount: 4, scenario };
        },
      });
      assert.equal(result.aggregateOutcome.kind, 'pass');
    });
  }
});
```
