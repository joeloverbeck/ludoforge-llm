/**
 * Semantic intermediate representation for action tooltips.
 * Each TooltipMessage represents one normalized effect from an EffectAST tree.
 */

export interface MessageBase {
  readonly kind: string;
  /** Pointer back to source AST node for trace preservation */
  readonly astPath: string;
  /** If this message was generated from a macro, the macro's id */
  readonly macroOrigin?: string;
  /** Pipeline stage name, if the action uses staged execution */
  readonly stage?: string;
}

export type VarScope = 'global' | 'player' | 'zone';

export interface SelectMessage extends MessageBase {
  readonly kind: 'select';
  readonly target: 'spaces' | 'zones' | 'items' | 'players' | 'values' | 'markers' | 'rows' | 'options' | 'tokens';
  readonly filter?: string;
  /** Raw condition AST for re-rendering with full LabelContext in the realizer */
  readonly conditionAST?: import('./types-ast.js').ConditionAST;
  readonly bounds?: { readonly min: number; readonly max: number };
  readonly optionHints?: readonly string[];
}

export interface PlaceMessage extends MessageBase {
  readonly kind: 'place';
  readonly tokenFilter: string;
  readonly targetZone: string;
  readonly filter?: string;
}

export interface MoveMessage extends MessageBase {
  readonly kind: 'move';
  readonly tokenFilter: string;
  readonly fromZone: string;
  readonly toZone: string;
  readonly variant?: 'adjacent';
  readonly filter?: string;
}

export interface PayMessage extends MessageBase {
  readonly kind: 'pay';
  readonly resource: string;
  readonly amount: number;
  readonly scope?: VarScope;
  readonly scopeOwner?: string;
}

export interface GainMessage extends MessageBase {
  readonly kind: 'gain';
  readonly resource: string;
  readonly amount: number;
  readonly scope?: VarScope;
  readonly scopeOwner?: string;
}

export interface TransferMessage extends MessageBase {
  readonly kind: 'transfer';
  readonly resource: string;
  readonly amount: number;
  readonly from: string;
  readonly to: string;
  readonly amountExpr?: string;
  readonly fromScope?: VarScope;
  readonly fromScopeOwner?: string;
  readonly toScope?: VarScope;
  readonly toScopeOwner?: string;
}

export interface ShiftMessage extends MessageBase {
  readonly kind: 'shift';
  readonly marker: string;
  readonly direction: string;
  readonly amount: number;
  readonly deltaExpr?: string;
}

export interface ActivateMessage extends MessageBase {
  readonly kind: 'activate';
  readonly tokenFilter: string;
  readonly zone: string;
}

export interface DeactivateMessage extends MessageBase {
  readonly kind: 'deactivate';
  readonly tokenFilter: string;
  readonly zone: string;
}

export interface RemoveMessage extends MessageBase {
  readonly kind: 'remove';
  readonly tokenFilter: string;
  readonly fromZone: string;
  readonly destination: string;
  readonly filter?: string;
  /** Budget constraint from removeByPriority (only present for budget-constrained removals) */
  readonly budget?: string;
}

export interface CreateMessage extends MessageBase {
  readonly kind: 'create';
  readonly tokenFilter: string;
  readonly targetZone: string;
}

export interface DestroyMessage extends MessageBase {
  readonly kind: 'destroy';
  readonly tokenFilter: string;
  readonly fromZone: string;
}

export interface RevealMessage extends MessageBase {
  readonly kind: 'reveal';
  readonly target: string;
}

export interface DrawMessage extends MessageBase {
  readonly kind: 'draw';
  readonly source: string;
  readonly count: number;
}

export interface ShuffleMessage extends MessageBase {
  readonly kind: 'shuffle';
  readonly target: string;
}

export interface SetMessage extends MessageBase {
  readonly kind: 'set';
  readonly target: string;
  readonly value: string;
  readonly toggle?: boolean;
  readonly scope?: VarScope;
  readonly scopeOwner?: string;
}

export interface ChooseMessage extends MessageBase {
  readonly kind: 'choose';
  readonly options: readonly string[];
  readonly paramName: string;
  readonly optional?: boolean;
}

export interface RollMessage extends MessageBase {
  readonly kind: 'roll';
  readonly range: { readonly min: number; readonly max: number };
  readonly bindTo: string;
}

export interface ModifierMessage extends MessageBase {
  readonly kind: 'modifier';
  readonly condition: string;
  readonly description: string;
  /** Original AST for runtime evaluation of active/inactive state */
  readonly conditionAST?: import('./types-ast.js').ConditionAST;
}

export interface BlockerMessage extends MessageBase {
  readonly kind: 'blocker';
  readonly reason: string;
}

export interface PhaseMessage extends MessageBase {
  readonly kind: 'phase';
  readonly fromPhase: string;
  readonly toPhase: string;
}

export interface GrantMessage extends MessageBase {
  readonly kind: 'grant';
  readonly operation: string;
  readonly targetPlayer: string;
}

export interface ConcealMessage extends MessageBase {
  readonly kind: 'conceal';
  readonly target: string;
}

export interface SummaryMessage extends MessageBase {
  readonly kind: 'summary';
  readonly text: string;
  readonly macroClass?: string;
}

export interface SuppressedMessage extends MessageBase {
  readonly kind: 'suppressed';
  readonly reason: string;
}

export type TooltipMessage =
  | SelectMessage
  | PlaceMessage
  | MoveMessage
  | PayMessage
  | GainMessage
  | TransferMessage
  | ShiftMessage
  | ActivateMessage
  | DeactivateMessage
  | RemoveMessage
  | CreateMessage
  | DestroyMessage
  | RevealMessage
  | DrawMessage
  | ShuffleMessage
  | SetMessage
  | ChooseMessage
  | RollMessage
  | ModifierMessage
  | BlockerMessage
  | PhaseMessage
  | GrantMessage
  | ConcealMessage
  | SummaryMessage
  | SuppressedMessage;

export const TOOLTIP_MESSAGE_KINDS = [
  'select', 'place', 'move', 'pay', 'gain', 'transfer', 'shift',
  'activate', 'deactivate', 'remove', 'create', 'destroy', 'reveal',
  'draw', 'shuffle', 'set', 'choose', 'roll', 'modifier', 'blocker',
  'phase', 'grant', 'conceal', 'summary', 'suppressed',
] as const;

export type TooltipMessageKind = (typeof TOOLTIP_MESSAGE_KINDS)[number];
