import type { CollectionRef, CompiledPlanTemplate, GameState } from '../kernel/types.js';
import type { SelectedItem } from './policy-selector-eval.js';

type RoleSelectorSource = CompiledPlanTemplate['roles'][string]['selector']['source'];

export function fallbackRoleSelections(
  source: RoleSelectorSource,
  state: GameState,
): readonly SelectedItem[] {
  const selectedId = firstRoleSelection(source, state);
  return selectedId === null
    ? []
    : [{ key: selectedId, quality: 0, rank: 0, components: new Map() }];
}

function firstRoleSelection(
  source: RoleSelectorSource,
  state: GameState,
): string | null {
  switch (source.kind) {
    case 'collection':
      return firstCollectionKey(source.collection, state);
    case 'product': {
      const left = firstCollectionKey(source.left, state);
      const right = firstCollectionKey(source.right, state);
      return left === null || right === null ? null : `${left}|${right}`;
    }
    case 'routePairs':
    case 'subset':
    case 'candidateParams':
    case 'microturnOptions':
      return null;
  }
}

function firstCollectionKey(
  collection: CollectionRef,
  state: GameState,
): string | null {
  switch (collection.kind) {
    case 'zones':
      return Object.keys(state.zones).sort(compareStable)[0] ?? null;
    case 'players':
      return state.playerCount > 0 ? '1' : null;
    case 'tokens':
      return Object.entries(state.zones)
        .sort(([left], [right]) => compareStable(left, right))
        .flatMap(([, tokens]) => tokens
          .filter((token) => collection.tokenType === undefined || token.type === collection.tokenType)
          .map((token) => String(token.id)))
        .sort(compareStable)[0] ?? null;
    case 'cards':
    case 'authoredFinite':
      return null;
  }
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
