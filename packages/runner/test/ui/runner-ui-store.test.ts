import { describe, expect, it } from 'vitest';

import { createRunnerUiStore } from '../../src/ui/runner-ui-store.js';

describe('runner-ui-store', () => {
  it('toggles and sets event-log visibility deterministically', () => {
    const store = createRunnerUiStore();

    expect(store.getState().eventLogVisible).toBe(true);

    store.getState().toggleEventLogVisible();
    expect(store.getState().eventLogVisible).toBe(false);

    store.getState().setEventLogVisible(true);
    expect(store.getState().eventLogVisible).toBe(true);

    store.getState().setEventLogVisible(false);
    expect(store.getState().eventLogVisible).toBe(false);
  });

  it('opens, closes, and toggles the settings menu deterministically', () => {
    const store = createRunnerUiStore();

    expect(store.getState().settingsMenuOpen).toBe(false);

    store.getState().openSettingsMenu();
    expect(store.getState().settingsMenuOpen).toBe(true);

    store.getState().toggleSettingsMenu();
    expect(store.getState().settingsMenuOpen).toBe(false);

    store.getState().toggleSettingsMenu();
    expect(store.getState().settingsMenuOpen).toBe(true);

    store.getState().closeSettingsMenu();
    expect(store.getState().settingsMenuOpen).toBe(false);
  });

  it('resets chrome state to the default session baseline', () => {
    const store = createRunnerUiStore();

    store.getState().toggleSettingsMenu();
    store.getState().setEventLogVisible(false);

    expect(store.getState().settingsMenuOpen).toBe(true);
    expect(store.getState().eventLogVisible).toBe(false);

    store.getState().resetChromeState();

    expect(store.getState().settingsMenuOpen).toBe(false);
    expect(store.getState().eventLogVisible).toBe(true);
  });
});
