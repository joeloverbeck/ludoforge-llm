import * as assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ENGINE_ROOT = resolve(import.meta.dirname ?? '.', '..', '..', '..', '..');
const manifestUrl = pathToFileURL(resolve(ENGINE_ROOT, 'scripts', 'test-lane-manifest.mjs')).href;
const manifest = (await import(manifestUrl)) as {
  readonly listE2eTestsForLane: (lane: string) => readonly string[];
};

describe('FITL competence lane isolation', () => {
  it('maps the competence lane to the exact competence runner file', () => {
    assert.deepEqual(
      manifest.listE2eTestsForLane('e2e:mcts:fitl:competence'),
      ['test/e2e/mcts-fitl/fitl-competence.test.ts'],
    );
  });

  it('does not alias budget-profile FITL MCTS tests into the competence lane', () => {
    const competenceFiles = new Set(manifest.listE2eTestsForLane('e2e:mcts:fitl:competence'));

    for (const lane of ['e2e:mcts:fitl:interactive', 'e2e:mcts:fitl:turn', 'e2e:mcts:fitl:background']) {
      for (const file of manifest.listE2eTestsForLane(lane)) {
        assert.equal(competenceFiles.has(file), false, `${file} must stay out of the competence lane`);
      }
    }
  });
});
