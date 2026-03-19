import { createStore, type StoreApi } from 'zustand/vanilla';

interface RunnerUiChromeState {
  readonly settingsMenuOpen: boolean;
  readonly eventLogVisible: boolean;
}

interface RunnerUiStoreActions {
  openSettingsMenu(): void;
  closeSettingsMenu(): void;
  toggleSettingsMenu(): void;
  resetChromeState(): void;
  setEventLogVisible(visible: boolean): void;
  toggleEventLogVisible(): void;
}

export type RunnerUiStore = RunnerUiChromeState & RunnerUiStoreActions;

const INITIAL_CHROME_STATE: RunnerUiChromeState = {
  settingsMenuOpen: false,
  eventLogVisible: true,
};

export function createRunnerUiStore(): StoreApi<RunnerUiStore> {
  return createStore<RunnerUiStore>()((set) => ({
    ...INITIAL_CHROME_STATE,

    openSettingsMenu() {
      set({ settingsMenuOpen: true });
    },

    closeSettingsMenu() {
      set({ settingsMenuOpen: false });
    },

    toggleSettingsMenu() {
      set((state) => ({ settingsMenuOpen: !state.settingsMenuOpen }));
    },

    resetChromeState() {
      set(INITIAL_CHROME_STATE);
    },

    setEventLogVisible(eventLogVisible) {
      set({ eventLogVisible });
    },

    toggleEventLogVisible() {
      set((state) => ({ eventLogVisible: !state.eventLogVisible }));
    },
  }));
}
