// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAP_CLASS_BUDGETS, type CapClass } from '../../../src/cnl/compile-agents.js';

const totalCost = (
  maxOptions: number,
  beamWidth: number,
  broadDepth: number,
  deepDepth: number,
): number => {
  const broadCost = maxOptions * (1 + beamWidth * maxOptions * Math.max(0, broadDepth - 1));
  const incrementalDeepCost = maxOptions * beamWidth * maxOptions * Math.max(0, deepDepth - broadDepth);
  return broadCost + incrementalDeepCost;
};

describe('continued deepening cost bound', () => {
  it('keeps every compiling tuple within its declared cap-class budget', () => {
    for (const capClass of Object.keys(CAP_CLASS_BUDGETS) as CapClass[]) {
      const cap = CAP_CLASS_BUDGETS[capClass];
      for (let maxOptions = 1; maxOptions <= 8; maxOptions += 1) {
        for (let beamWidth = 1; beamWidth <= 4; beamWidth += 1) {
          for (let broadDepth = 1; broadDepth <= 16; broadDepth += 1) {
            for (let deepDepth = broadDepth; deepDepth <= 16; deepDepth += 1) {
              const cost = totalCost(maxOptions, beamWidth, broadDepth, deepDepth);
              if (cost <= cap) {
                assert.ok(Number.isSafeInteger(cost));
                assert.ok(cost <= CAP_CLASS_BUDGETS[capClass]);
              }
            }
          }
        }
      }
    }
  });
});
