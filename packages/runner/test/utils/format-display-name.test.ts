import { describe, expect, it } from 'vitest';

import { formatIdAsDisplayName } from '../../src/utils/format-display-name';

describe('formatIdAsDisplayName', () => {
  it('formats kebab-case IDs', () => {
    expect(formatIdAsDisplayName('train-us')).toBe('Train Us');
  });

  it('formats camelCase IDs', () => {
    expect(formatIdAsDisplayName('activePlayer')).toBe('Active Player');
  });

  it('formats snake_case IDs', () => {
    expect(formatIdAsDisplayName('total_support')).toBe('Total Support');
  });

  it('formats owner zone suffixes', () => {
    expect(formatIdAsDisplayName('hand:0')).toBe('Hand 0');
    expect(formatIdAsDisplayName('hand:1')).toBe('Hand 1');
  });

  it('formats plain words', () => {
    expect(formatIdAsDisplayName('main')).toBe('Main');
  });

  it('preserves all-caps acronyms', () => {
    expect(formatIdAsDisplayName('ARVN')).toBe('ARVN');
  });

  it('formats mixed lowercase words', () => {
    expect(formatIdAsDisplayName('nva-guerrilla')).toBe('Nva Guerrilla');
  });

  it('returns empty string for empty input', () => {
    expect(formatIdAsDisplayName('')).toBe('');
  });

  it('preserves plain numeric IDs', () => {
    expect(formatIdAsDisplayName('0')).toBe('0');
  });

  it('formats non-numeric colon suffixes', () => {
    expect(formatIdAsDisplayName('table:none')).toBe('Table None');
  });

  it('formats multi-colon IDs using the final segment as suffix', () => {
    expect(formatIdAsDisplayName('table:player_zone:0')).toBe('Table Player Zone 0');
  });

  it('does not throw on repeated separators', () => {
    expect(formatIdAsDisplayName('phase--main__step')).toBe('Phase Main Step');
  });
});
