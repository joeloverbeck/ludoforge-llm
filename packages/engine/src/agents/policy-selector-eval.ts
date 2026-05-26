import type {
  AgentPolicyExpr,
  CollectionRef,
  CompiledObserverProfile,
  CompiledPolicySelector,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  ResultSpec,
} from '../kernel/types.js';
import type { PlayerId } from '../kernel/branded.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import type { PolicyValue } from './policy-surface.js';

export const DEFAULT_SELECTOR_EMPTY_DEMOTE_PENALTY = -100;

export interface SelectorEvalCandidate {
  readonly stableMoveKey: string;
  readonly move: Move;
  readonly actionId: string;
}

export interface SelectedItem {
  readonly key: string;
  readonly quality: number;
  readonly rank: number;
  readonly components: ReadonlyMap<string, number>;
}

export interface SelectedSelectorView {
  readonly selectorId: string;
  readonly selected: readonly SelectedItem[];
  readonly current?: SelectedItem;
  readonly impactSatisfied: boolean;
  readonly emptyReason?: 'whereExcludedAll' | 'sourceEmpty' | 'minImpactFailed';
  readonly emptyMode?: ResultSpec['onEmpty'];
  readonly emptyPenalty?: number;
}

export interface SelectorEvalContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly candidates: readonly SelectorEvalCandidate[];
  readonly candidate?: SelectorEvalCandidate;
  readonly microturnOptions?: readonly SelectorEvalMicroturnOption[];
  readonly observerPlayerId?: PlayerId;
  readonly observerProfile?: CompiledObserverProfile;
  readonly currentItemKey?: string;
  readonly selectors?: Readonly<Record<string, CompiledPolicySelector>>;
  evaluateExpr(
    expr: AgentPolicyExpr,
    candidate: SelectorEvalCandidate | undefined,
    microturnOption?: SelectorEvalMicroturnOption,
    selectorItemKey?: string,
  ): PolicyValue;
  onProductTruncated?(selectorId: string): void;
  onSelectorEmpty?(selectorId: string, reason: SelectedSelectorView['emptyReason']): void;
  onPreviewFallback?(fallback: {
    readonly selectorId: string;
    readonly componentId: string;
    readonly kind: 'noContribution' | 'constant';
    readonly value?: number;
  }): void;
}

export interface SelectorEvalMicroturnOption {
  readonly key: string;
  readonly value: MoveParamValue;
  readonly index: number;
}

interface SelectorSourceItem {
  readonly key: string;
  readonly candidate?: SelectorEvalCandidate;
  readonly microturnOption?: SelectorEvalMicroturnOption;
}

interface ObserverVisibleState {
  readonly visibleTokenIds: ReadonlySet<string> | undefined;
}

export function evaluateSelector(
  selector: CompiledPolicySelector,
  context: SelectorEvalContext,
): SelectedSelectorView {
  return evaluateSelectorInternal(selector, context, [selector.id]);
}

function evaluateSelectorInternal(
  selector: CompiledPolicySelector,
  context: SelectorEvalContext,
  selectorStack: readonly string[],
): SelectedSelectorView {
  const source = materializeSource(selector, context, selectorStack);
  if (source.length === 0) {
    return emptyView(selector, context, 'sourceEmpty');
  }

  const filtered = selector.where === undefined
    ? source
    : source.filter((item) => context.evaluateExpr(selector.where!, item.candidate ?? context.candidate, item.microturnOption) === true);
  if (filtered.length === 0) {
    return emptyView(selector, context, 'whereExcludedAll');
  }

  const scored = filtered.map((item) => scoreItem(selector, context, item));
  const ranked = rankAndTruncate(scored, selector.result.order, scored.length);
  const selected = ranked.slice(0, selector.result.maxItems);
  if (selected.length === 0) {
    return emptyView(selector, context, 'sourceEmpty');
  }
  const current = context.currentItemKey === undefined
    ? undefined
    : ranked.find((item) => item.key === context.currentItemKey);

  const minImpactSatisfied = selector.minImpact === undefined
    ? true
    : context.evaluateExpr(selector.minImpact, selected[0]?.key === context.candidate?.stableMoveKey ? context.candidate : undefined) === true;
  return minImpactSatisfied
    ? { selectorId: selector.id, selected, ...(current === undefined ? {} : { current }), impactSatisfied: true }
    : emptyView(selector, context, 'minImpactFailed');
}

function emptyView(
  selector: CompiledPolicySelector,
  context: SelectorEvalContext,
  reason: NonNullable<SelectedSelectorView['emptyReason']>,
): SelectedSelectorView {
  if (selector.result.onEmpty === 'traceAndNoContribution') {
    context.onSelectorEmpty?.(selector.id, reason);
  }
  return {
    selectorId: selector.id,
    selected: [],
    impactSatisfied: false,
    emptyReason: reason,
    emptyMode: selector.result.onEmpty,
    ...(selector.result.onEmpty === 'demote' ? { emptyPenalty: DEFAULT_SELECTOR_EMPTY_DEMOTE_PENALTY } : {}),
  };
}

function materializeSource(
  selector: CompiledPolicySelector,
  context: SelectorEvalContext,
  selectorStack: readonly string[],
): readonly SelectorSourceItem[] {
  const { source } = selector;
  switch (source.kind) {
    case 'collection':
      return materializeCollection(source.collection, context);
    case 'product': {
      const left = materializeCollection(source.left, context);
      const right = materializeCollection(source.right, context);
      const result: SelectorSourceItem[] = [];
      for (const leftItem of left) {
        for (const rightItem of right) {
          if (result.length >= source.maxPairs) {
            context.onProductTruncated?.(selector.id);
            return result;
          }
          result.push({ key: `${leftItem.key}|${rightItem.key}` });
        }
      }
      return result;
    }
    case 'routePairs': {
      const origin = materializeSelectorSource(source.originSelectorId, context, selectorStack);
      const destination = materializeSelectorSource(source.destinationSelectorId, context, selectorStack);
      const result: SelectorSourceItem[] = [];
      for (const originItem of origin) {
        for (const destinationItem of destination) {
          if (result.length >= source.maxPairs) {
            context.onProductTruncated?.(selector.id);
            return result;
          }
          result.push({ key: `${originItem.key}|${destinationItem.key}` });
        }
      }
      return result;
    }
    case 'subset': {
      const base = source.of.kind === 'collection'
        ? materializeCollection(source.of.collection, context)
        : materializeSelectorSource(source.of.selectorId, context, selectorStack);
      return materializeSubsets(base, source.min, source.max, source.beamWidth);
    }
    case 'candidateParams':
      return materializeCandidateParam(context, source.param, context.candidate);
    case 'microturnOptions':
      return materializeMicroturnOptions(context);
  }
}

function materializeSelectorSource(
  selectorId: string,
  context: SelectorEvalContext,
  selectorStack: readonly string[],
): readonly SelectorSourceItem[] {
  if (selectorStack.includes(selectorId)) {
    return [];
  }
  const selector = context.selectors?.[selectorId];
  if (selector === undefined) {
    return [];
  }
  const view = evaluateSelectorInternal(selector, context, [...selectorStack, selectorId]);
  return view.selected.map((item) => ({ key: item.key }));
}

function materializeSubsets(
  source: readonly SelectorSourceItem[],
  min: number,
  max: number,
  beamWidth: number,
): readonly SelectorSourceItem[] {
  const ordered = [...source].sort((left, right) => left.key.localeCompare(right.key));
  const result: SelectorSourceItem[] = [];
  const upper = Math.min(max, ordered.length);
  const pushCombinations = (start: number, size: number, keys: readonly string[]): void => {
    if (result.length >= beamWidth) {
      return;
    }
    if (keys.length === size) {
      result.push({ key: keys.join('|') });
      return;
    }
    const remaining = size - keys.length;
    for (let index = start; index <= ordered.length - remaining; index += 1) {
      pushCombinations(index + 1, size, [...keys, ordered[index]!.key]);
      if (result.length >= beamWidth) {
        return;
      }
    }
  };
  for (let size = min; size <= upper; size += 1) {
    if (size === 0) {
      result.push({ key: '' });
    } else {
      pushCombinations(0, size, []);
    }
    if (result.length >= beamWidth) {
      return result;
    }
  }
  return result;
}

function materializeCollection(
  collection: CollectionRef,
  context: SelectorEvalContext,
): readonly SelectorSourceItem[] {
  const visible = observerVisibleState(context);
  switch (collection.kind) {
    case 'zones':
      return Object.keys(context.state.zones).sort().map((key) => ({ key }));
    case 'tokens':
      return Object.entries(context.state.zones)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, tokens]) => tokens
          .filter((token) => collection.tokenType === undefined || token.type === collection.tokenType)
          .filter((token) => visible.visibleTokenIds === undefined || visible.visibleTokenIds.has(String(token.id)))
          .map((token) => ({ key: String(token.id) })))
        .sort((left, right) => left.key.localeCompare(right.key));
    case 'players':
      return Array.from({ length: context.state.playerCount }, (_, index) => ({ key: String(index + 1) }));
    case 'cards':
      return materializeCardCollection(collection, context);
    case 'authoredFinite':
      return [];
  }
}

function materializeCardCollection(
  collection: Extract<CollectionRef, { readonly kind: 'cards' }>,
  context: SelectorEvalContext,
): readonly SelectorSourceItem[] {
  const visibleTokenIds = context.observerPlayerId === undefined
    ? undefined
    : derivePlayerObservation(context.def, context.state, context.observerPlayerId, context.observerProfile).visibleTokenIdsByZone;
  return Object.entries(context.state.zones)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([zoneId, tokens]) => {
      if (collection.deck !== undefined && zoneBaseId(zoneId) !== collection.deck) {
        return [];
      }
      const visibleIds = visibleTokenIds?.[zoneId];
      const allowed = visibleIds === undefined ? undefined : new Set(visibleIds);
      return tokens
        .filter((token) => allowed === undefined || allowed.has(String(token.id)))
        .map((token) => ({ key: String(token.id) }));
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function zoneBaseId(zoneId: string): string {
  const colonIndex = zoneId.indexOf(':');
  return colonIndex === -1 ? zoneId : zoneId.slice(0, colonIndex);
}

function materializeCandidateParam(
  context: SelectorEvalContext,
  param: string,
  candidate: SelectorEvalCandidate | undefined,
): readonly SelectorSourceItem[] {
  const value = candidate?.move.params[param];
  if (value === undefined || value === null) {
    return [];
  }
  const visible = observerVisibleState(context);
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((entry) => String(entry))
    .filter((key) => visible.visibleTokenIds === undefined || !isKnownHiddenTokenKey(key, visible.visibleTokenIds, context))
    .map((key) => ({
      key,
      ...(candidate === undefined ? {} : { candidate }),
    }));
}

function materializeMicroturnOptions(context: SelectorEvalContext): readonly SelectorSourceItem[] {
  const visible = observerVisibleState(context);
  return (context.microturnOptions ?? [])
    .filter((entry) => !isKnownHiddenTokenKey(entry.key, visible.visibleTokenIds, context))
    .map((entry) => ({ key: entry.key, microturnOption: entry }));
}

function observerVisibleState(context: SelectorEvalContext): ObserverVisibleState {
  if (context.observerPlayerId === undefined) {
    return { visibleTokenIds: undefined };
  }
  const observation = derivePlayerObservation(
    context.def,
    context.state,
    context.observerPlayerId,
    context.observerProfile,
  );
  return {
    visibleTokenIds: new Set(Object.values(observation.visibleTokenIdsByZone).flat()),
  };
}

function isKnownHiddenTokenKey(
  key: string,
  visibleTokenIds: ReadonlySet<string> | undefined,
  context: SelectorEvalContext,
): boolean {
  if (visibleTokenIds === undefined) {
    return false;
  }
  if (visibleTokenIds.has(key)) {
    return false;
  }
  return Object.values(context.state.zones).some((tokens) => tokens.some((token) => String(token.id) === key));
}

function scoreItem(
  selector: CompiledPolicySelector,
  context: SelectorEvalContext,
  item: SelectorSourceItem,
): Omit<SelectedItem, 'rank'> {
  const components = new Map<string, number>();
  let quality = 0;
  for (const component of selector.quality?.components ?? []) {
    const rawValue = context.evaluateExpr(component.value, item.candidate ?? context.candidate, item.microturnOption, item.key);
    const value = typeof rawValue === 'number'
      ? rawValue
      : component.previewFallback?.onUnavailable === 'noContribution'
        ? 0
        : typeof component.previewFallback?.onUnavailable === 'object'
          ? component.previewFallback.onUnavailable.value
          : undefined;
    if (typeof rawValue !== 'number' && component.previewFallback?.onUnavailable !== undefined) {
      const fallback = component.previewFallback.onUnavailable;
      if (context.currentItemKey === undefined || item.key === context.currentItemKey) {
        context.onPreviewFallback?.({
          selectorId: selector.id,
          componentId: component.id,
          kind: fallback === 'noContribution' ? 'noContribution' : 'constant',
          ...(fallback === 'noContribution' ? {} : { value: fallback.value }),
        });
      }
    }
    if (value === undefined) {
      continue;
    }
    components.set(component.id, value);
    quality += value * component.weight;
  }
  return { key: item.key, quality, components };
}

function rankAndTruncate(
  items: readonly Omit<SelectedItem, 'rank'>[],
  order: CompiledPolicySelector['result']['order'],
  maxItems: number,
): readonly SelectedItem[] {
  const ranked = [...items].sort((left, right) => compareSelectedItems(left, right, order));
  return ranked.slice(0, maxItems).map((item, index) => ({ ...item, rank: index + 1 }));
}

function compareSelectedItems(
  left: Omit<SelectedItem, 'rank'>,
  right: Omit<SelectedItem, 'rank'>,
  order: CompiledPolicySelector['result']['order'],
): number {
  for (const entry of order) {
    switch (entry) {
      case 'qualityDesc':
        if (left.quality !== right.quality) return right.quality - left.quality;
        break;
      case 'qualityAsc':
        if (left.quality !== right.quality) return left.quality - right.quality;
        break;
      case 'stableKeyAsc': {
        const compared = left.key.localeCompare(right.key);
        if (compared !== 0) return compared;
        break;
      }
      case 'stableKeyDesc': {
        const compared = right.key.localeCompare(left.key);
        if (compared !== 0) return compared;
        break;
      }
    }
  }
  return left.key.localeCompare(right.key);
}
