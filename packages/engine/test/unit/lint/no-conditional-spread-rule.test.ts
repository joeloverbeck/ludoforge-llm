import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

describe('no-conditional-spread rule', () => {
  it('flags conditional spreads only for canonical hot-path object shapes', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'eslint.config.js'));
    const rulePath = resolve(repoRoot, 'tools/eslint-rules/no-conditional-spread.js');
    const { default: rule } = await import(pathToFileURL(rulePath).href);
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          plugins: {
            local: {
              rules: {
                'no-conditional-spread': rule,
              },
            },
          },
          rules: {
            'local/no-conditional-spread': 'error',
          },
        },
      ],
    });

    const filePath = resolve(repoRoot, 'packages/engine/src/kernel/example.ts');
    const source = `
      const flagged = {
        state,
        rng,
        bindings,
        decisionScope,
        effectPath,
        ...(tracker !== undefined ? { tracker } : {}),
      };

      const allowedNonHotPath = {
        label,
        ...(detail !== undefined ? { detail } : {}),
      };

      const allowedNormalSpread = {
        state,
        rng,
        bindings,
        decisionScope,
        effectPath,
        tracker: undefined,
        ...extras,
      };
    `;

    const [result] = await eslint.lintText(source, { filePath });
    const messages = result?.messages ?? [];

    assert.equal(messages.length, 1, 'exactly one hot-path conditional spread should be reported');
    assert.match(
      messages[0]?.message ?? '',
      /canonical hot-path runtime objects/u,
      'reported message should explain the canonical-shape constraint',
    );
  });
});
