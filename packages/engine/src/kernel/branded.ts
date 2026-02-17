type Brand<TBase, TBrand extends string> = TBase & { readonly __brand: TBrand };

export type PlayerId = Brand<number, 'PlayerId'>;
export type ZoneId = Brand<string, 'ZoneId'>;
export type TokenId = Brand<string, 'TokenId'>;
export type ActionId = Brand<string, 'ActionId'>;
export type PhaseId = Brand<string, 'PhaseId'>;
export type TriggerId = Brand<string, 'TriggerId'>;

export const asPlayerId = (value: number): PlayerId => value as PlayerId;
export const asZoneId = (value: string): ZoneId => value as ZoneId;
export const asTokenId = (value: string): TokenId => value as TokenId;
export const asActionId = (value: string): ActionId => value as ActionId;
export const asPhaseId = (value: string): PhaseId => value as PhaseId;
export const asTriggerId = (value: string): TriggerId => value as TriggerId;

export const isPlayerId = (value: unknown): value is PlayerId => typeof value === 'number';
export const isZoneId = (value: unknown): value is ZoneId => typeof value === 'string';
export const isTokenId = (value: unknown): value is TokenId => typeof value === 'string';
export const isActionId = (value: unknown): value is ActionId => typeof value === 'string';
export const isPhaseId = (value: unknown): value is PhaseId => typeof value === 'string';
export const isTriggerId = (value: unknown): value is TriggerId => typeof value === 'string';
