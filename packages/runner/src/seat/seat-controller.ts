import type { AgentDescriptor } from '@ludoforge/engine/runtime';

export interface HumanSeatController {
  readonly kind: 'human';
}

export interface AgentSeatController {
  readonly kind: 'agent';
  readonly agent: AgentDescriptor;
}

export type SeatController = HumanSeatController | AgentSeatController;

export interface PlayerSeatConfig {
  readonly playerId: number;
  readonly controller: SeatController;
}

const DEFAULT_POLICY_AGENT_DESCRIPTOR: AgentDescriptor = { kind: 'policy' };

export function createHumanSeatController(): HumanSeatController {
  return { kind: 'human' };
}

export function createAgentSeatController(agent: AgentDescriptor = DEFAULT_POLICY_AGENT_DESCRIPTOR): AgentSeatController {
  return { kind: 'agent', agent };
}

export function normalizeSeatController(controller: SeatController | undefined): SeatController {
  if (controller === undefined) {
    return createAgentSeatController(getDefaultAgentDescriptor());
  }
  if (controller.kind === 'human') {
    return controller;
  }
  return createAgentSeatController(controller.agent);
}

export function isHumanSeatController(controller: SeatController | undefined): controller is HumanSeatController {
  return controller?.kind === 'human';
}

export function isAgentSeatController(controller: SeatController | undefined): controller is AgentSeatController {
  return controller?.kind === 'agent';
}

export function getDefaultAgentDescriptor(): AgentDescriptor {
  return DEFAULT_POLICY_AGENT_DESCRIPTOR;
}
