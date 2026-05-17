import type { Diagnostic } from '../kernel/diagnostics.js';
import type { AgentPolicyExpr, CompiledAgentPolicyRef } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export interface PreviewSeatAggRefs {
  readonly fallbackRequired: readonly string[];
  readonly implicitSkipUnavailable: readonly string[];
}

export function collectPreviewSeatAggRefIds(expr: AgentPolicyExpr): PreviewSeatAggRefs {
  const fallbackRequired = new Set<string>();
  const implicitSkipUnavailable = new Set<string>();
  const visit = (
    current: AgentPolicyExpr,
    availability?: Extract<AgentPolicyExpr, { readonly kind: 'seatAgg' }>['availability'],
  ): void => {
    switch (current.kind) {
      case 'ref':
        if (current.ref.kind !== 'previewSurface') return;
        if (availability === undefined) implicitSkipUnavailable.add(previewSurfaceRefKey(current.ref));
        if (availability === 'requireAllReady' || availability === 'requireAnyReady' || availability === 'selfAndTargetReady') {
          fallbackRequired.add(previewSurfaceRefKey(current.ref));
        }
        return;
      case 'op':
        current.args.forEach((arg) => visit(arg, availability));
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') visit(current.zone, availability);
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') visit(current.anchorZone, availability);
        return;
      case 'seatAgg':
        visit(current.expr, current.availability);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') visit(current.zone, availability);
        return;
      default:
        return;
    }
  };
  visit(expr);
  return {
    fallbackRequired: [...fallbackRequired].sort(),
    implicitSkipUnavailable: [...implicitSkipUnavailable].sort(),
  };
}

export function warnImplicitPreviewSeatAggAvailability(
  diagnostics: Diagnostic[],
  considerationId: string,
  path: string,
  refs: readonly string[],
): void {
  if (refs.length === 0) return;
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK,
    path: `${path}.value`,
    severity: 'warning',
    message: `Consideration "${considerationId}" uses preview-derived seatAgg refs ${refs.join(', ')} with implicit skipUnavailable availability.`,
    suggestion: 'Set seatAgg.availability explicitly to requireAllReady, requireAnyReady, selfAndTargetReady, or skipUnavailable.',
  });
}


function previewSurfaceRefKey(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewSurface' }>): string {
  const selector = ref.selector?.kind === 'role'
    ? ref.selector.seatToken
    : ref.selector?.kind === 'player'
      ? ref.selector.player
      : undefined;
  switch (ref.family) {
    case 'victoryCurrentMargin':
      return `preview.victory.currentMargin.${selector ?? ref.id}`;
    case 'victoryCurrentRank':
      return `preview.victory.currentRank.${selector ?? ref.id}`;
    case 'globalVar':
      return `preview.var.global.${ref.id}`;
    case 'globalMarker':
      return `preview.marker.global.${ref.id}`;
    case 'perPlayerVar':
      return `preview.var.player.${selector ?? 'self'}.${ref.id}`;
    case 'derivedMetric':
      return `preview.metric.${ref.id}`;
    case 'activeCardIdentity':
      return 'preview.activeCard.identity';
    case 'activeCardTag':
      return 'preview.activeCard.tag';
    case 'activeCardMetadata':
      return 'preview.activeCard.metadata';
    case 'activeCardAnnotation':
      return 'preview.activeCard.annotation';
  }
}
