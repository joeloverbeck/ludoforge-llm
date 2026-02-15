export const TURN_FLOW_INTERRUPT_SELECTOR_EMPTY_MESSAGE =
  'interrupt move selector must declare at least one matching field.';

type TurnFlowInterruptSelectorShape = {
  readonly actionId?: string | undefined;
  readonly actionClass?: string | undefined;
  readonly eventCardId?: string | undefined;
  readonly eventCardTagsAll?: readonly string[] | undefined;
  readonly eventCardTagsAny?: readonly string[] | undefined;
  readonly paramEquals?: Readonly<Record<string, unknown>> | undefined;
};

export const hasTurnFlowInterruptSelectorMatchField = (
  selector: Readonly<TurnFlowInterruptSelectorShape>,
): boolean =>
  selector.actionId !== undefined ||
  selector.actionClass !== undefined ||
  selector.eventCardId !== undefined ||
  selector.eventCardTagsAll !== undefined ||
  selector.eventCardTagsAny !== undefined ||
  selector.paramEquals !== undefined;
