import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';

export const SPEC_140_DECISION_KINDS = ['chooseN', 'chooseOne', 'chooseStochastic'] as const;

export type Spec140DecisionKind = (typeof SPEC_140_DECISION_KINDS)[number];

export interface Spec140MicroturnStep {
  readonly decisionKind: Spec140DecisionKind;
  readonly decisionKey: string;
  readonly optionsAtPublication: string;
  readonly legalActionCount: string;
  readonly occurrence: string;
}

export interface Spec140CompoundTurnInventoryEntry {
  readonly inventoryId: string;
  readonly sourceKind: 'actionPipeline' | 'eventCard';
  readonly sourceId: string;
  readonly actionId: string;
  readonly title: string;
  readonly triggerState: string;
  readonly microturnSequence: readonly Spec140MicroturnStep[];
  readonly turnRetirementBoundary: string;
  readonly reactionInterruptBoundaries: readonly string[];
}

const FIXTURE_PATH = join(resolveRepoRoot(), 'packages', 'engine', 'test', 'fixtures', 'spec-140-compound-turn-shapes', 'fitl-actions.json');
const REQUIRED_CORE_ACTION_IDS = ['march', 'terror', 'assault', 'patrol', 'rally', 'train', 'ambushNva', 'ambushVc'] as const;

export function loadSpec140CompoundTurnInventory(): readonly Spec140CompoundTurnInventoryEntry[] {
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;
  assert.ok(Array.isArray(parsed), 'spec-140 fitl-actions fixture must be a JSON array');
  return parsed as readonly Spec140CompoundTurnInventoryEntry[];
}

export function validateCompoundTurnInventory(): readonly Spec140CompoundTurnInventoryEntry[] {
  const entries = loadSpec140CompoundTurnInventory();
  const seenIds = new Set<string>();

  for (const entry of entries) {
    assert.equal(typeof entry.inventoryId, 'string', 'inventoryId must be present');
    assert.equal(typeof entry.sourceId, 'string', `${entry.inventoryId} sourceId must be present`);
    assert.equal(typeof entry.actionId, 'string', `${entry.inventoryId} actionId must be present`);
    assert.equal(typeof entry.title, 'string', `${entry.inventoryId} title must be present`);
    assert.equal(typeof entry.triggerState, 'string', `${entry.inventoryId} triggerState must be present`);
    assert.equal(typeof entry.turnRetirementBoundary, 'string', `${entry.inventoryId} turnRetirementBoundary must be present`);
    assert.ok(Array.isArray(entry.microturnSequence), `${entry.inventoryId} microturnSequence must be an array`);
    assert.ok(Array.isArray(entry.reactionInterruptBoundaries), `${entry.inventoryId} reactionInterruptBoundaries must be an array`);
    assert.ok(!seenIds.has(entry.inventoryId), `duplicate inventory entry: ${entry.inventoryId}`);
    seenIds.add(entry.inventoryId);

    for (const step of entry.microturnSequence) {
      assert.ok(
        SPEC_140_DECISION_KINDS.includes(step.decisionKind),
        `${entry.inventoryId} step ${step.decisionKey} has invalid decision kind ${String(step.decisionKind)}`,
      );
      assert.equal(typeof step.decisionKey, 'string', `${entry.inventoryId} decisionKey must be present`);
      assert.equal(typeof step.optionsAtPublication, 'string', `${entry.inventoryId} optionsAtPublication must be present`);
      assert.equal(typeof step.legalActionCount, 'string', `${entry.inventoryId} legalActionCount must be present`);
      assert.equal(typeof step.occurrence, 'string', `${entry.inventoryId} occurrence must be present`);
    }
  }

  const expectedIds = collectExpectedCompoundTurnInventoryIds();
  const actualIds = new Set(entries.map((entry) => entry.inventoryId));
  const missingIds = [...expectedIds].filter((id) => !actualIds.has(id)).sort();
  const unexpectedIds = [...actualIds].filter((id) => !expectedIds.has(id)).sort();

  assert.deepEqual(missingIds, [], `fixture omitted live FITL compound-turn surfaces: ${missingIds.join(', ')}`);
  assert.deepEqual(unexpectedIds, [], `fixture contains stale FITL compound-turn surfaces: ${unexpectedIds.join(', ')}`);

  for (const actionId of REQUIRED_CORE_ACTION_IDS) {
    assert.ok(entries.some((entry) => entry.actionId === actionId), `fixture must include a ${actionId} compound-turn surface`);
  }

  return entries;
}

function collectExpectedCompoundTurnInventoryIds(): ReadonlySet<string> {
  const compiled = compileProductionSpec().compiled.gameDef;
  const inventoryIds = new Set<string>();

  for (const pipeline of compiled.actionPipelines ?? []) {
    if (containsCompoundTurnDecision(pipeline.stages)) {
      inventoryIds.add(`pipeline:${pipeline.id}`);
    }
  }

  for (const deck of compiled.eventDecks ?? []) {
    for (const card of deck.cards ?? []) {
      for (const side of ['unshaded', 'shaded'] as const) {
        if (containsCompoundTurnDecision(card[side]?.effects ?? [])) {
          inventoryIds.add(`event:${card.id}:${side}`);
        }
      }
    }
  }

  return inventoryIds;
}

function containsCompoundTurnDecision(node: unknown): boolean {
  if (node == null || typeof node !== 'object') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((item) => containsCompoundTurnDecision(item));
  }

  const candidate = node as Record<string, unknown>;
  if ('chooseN' in candidate || 'chooseOne' in candidate || 'rollRandom' in candidate) {
    return true;
  }

  return Object.values(candidate).some((value) => containsCompoundTurnDecision(value));
}

function resolveRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(cursor, 'pnpm-workspace.yaml');
    try {
      readFileSync(candidate, 'utf8');
      return cursor;
    } catch {
      cursor = join(cursor, '..');
    }
  }

  return process.cwd();
}
