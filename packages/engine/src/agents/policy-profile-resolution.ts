import type { PlayerId } from '../kernel/branded.js';
import type { AgentPolicyCatalog, CompiledAgentProfile, GameDef } from '../kernel/types.js';

export interface ResolvedPolicyProfile {
  readonly catalog: AgentPolicyCatalog;
  readonly seatId: string;
  readonly profileId: string;
  readonly profile: CompiledAgentProfile;
}

export function resolvePolicyBindingSeatId(def: GameDef, playerId: PlayerId): string | null {
  const directSeatId = def.seats?.[playerId]?.id;
  if (typeof directSeatId === 'string' && directSeatId.length > 0) {
    return directSeatId;
  }

  if (def.seats?.length === 1) {
    const sharedSeatId = def.seats[0]?.id;
    return typeof sharedSeatId === 'string' && sharedSeatId.length > 0 ? sharedSeatId : null;
  }

  return null;
}

export function resolveEffectivePolicyProfile(
  def: GameDef,
  playerId: PlayerId,
  profileIdOverride?: string,
): ResolvedPolicyProfile | null {
  const catalog = def.agents;
  if (catalog === undefined) {
    return null;
  }

  const seatId = resolvePolicyBindingSeatId(def, playerId);
  if (seatId === null) {
    return null;
  }

  const profileId = profileIdOverride ?? catalog.bindingsBySeat[seatId];
  if (profileId === undefined) {
    return null;
  }

  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    return null;
  }

  return {
    catalog,
    seatId,
    profileId,
    profile,
  };
}
