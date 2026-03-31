import type {
  CompiledEventCardAnnotation,
  CompiledEventSideAnnotation,
  CompiledAgentPolicySurfaceSelector,
} from '../kernel/types.js';

export type AnnotationValue = number | boolean | undefined;

const PER_SEAT_RECORD_METRICS: ReadonlySet<string> = new Set([
  'tokenPlacements',
  'tokenRemovals',
  'tokenCreations',
  'tokenDestructions',
]);

export function extractAnnotationValue(
  annotation: CompiledEventCardAnnotation,
  ref: { readonly id: string; readonly selector?: CompiledAgentPolicySurfaceSelector },
  evaluatingSeatId: string,
  activeSeatId?: string,
): AnnotationValue {
  const dotIdx = ref.id.indexOf('.');
  if (dotIdx === -1) {
    return undefined;
  }
  const side = ref.id.slice(0, dotIdx) as 'unshaded' | 'shaded';
  const sideAnnotation: CompiledEventSideAnnotation | undefined = annotation[side];
  if (sideAnnotation === undefined) {
    return undefined;
  }
  const rest = ref.id.slice(dotIdx + 1);
  const metricDotIdx = rest.indexOf('.');
  const metric = metricDotIdx === -1 ? rest : rest.slice(0, metricDotIdx);

  if (PER_SEAT_RECORD_METRICS.has(metric)) {
    const record = sideAnnotation[metric as keyof CompiledEventSideAnnotation] as Readonly<Record<string, number>>;
    let seatKey: string | undefined;
    if (ref.selector?.kind === 'player') {
      seatKey = ref.selector.player === 'self'
        ? evaluatingSeatId
        : (ref.selector.player === 'active' ? activeSeatId : undefined);
    } else if (ref.selector?.kind === 'role') {
      seatKey = ref.selector.seatToken;
    }
    return seatKey !== undefined ? (record[seatKey] ?? 0) : undefined;
  }

  const value = sideAnnotation[metric as keyof CompiledEventSideAnnotation];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}
