import { describe, expect, it, vi } from 'vitest';

import { buildRunnerControlSections } from '../../src/ui/runner-control-surface.js';

function createActions() {
  return {
    setAnimationPlaybackSpeed: vi.fn(),
    setAnimationPaused: vi.fn(),
    requestAnimationSkipCurrent: vi.fn(),
    setAiPlaybackDetailLevel: vi.fn(),
    setAiPlaybackAutoSkip: vi.fn(),
  };
}

describe('runner-control-surface', () => {
  it('emits Playback, AI Playback, and Diagnostics sections in spec order', () => {
    const actions = createActions();

    const sections = buildRunnerControlSections({
      animationPlaying: true,
      animationPaused: false,
      animationPlaybackSpeed: '2x',
      aiPlaybackDetailLevel: 'standard',
      aiPlaybackAutoSkip: false,
    }, actions);

    expect(sections.map((section) => section.label)).toEqual([
      'Playback',
      'AI Playback',
      'Diagnostics',
    ]);
  });

  it('maps selected playback and AI values from runner state', () => {
    const actions = createActions();

    const sections = buildRunnerControlSections({
      animationPlaying: true,
      animationPaused: false,
      animationPlaybackSpeed: '4x',
      aiPlaybackDetailLevel: 'minimal',
      aiPlaybackAutoSkip: true,
    }, actions);

    expect(sections[0]?.controls[0]).toMatchObject({
      id: 'speed',
      kind: 'segmented',
      value: '4x',
    });
    expect(sections[1]?.controls[0]).toMatchObject({
      id: 'ai-detail-level',
      kind: 'select',
      value: 'minimal',
    });
    expect(sections[1]?.controls[1]).toMatchObject({
      id: 'ai-auto-skip',
      kind: 'toggle',
      checked: true,
    });
  });

  it('disables pause and skip actions while no animation is playing', () => {
    const actions = createActions();

    const sections = buildRunnerControlSections({
      animationPlaying: false,
      animationPaused: true,
      animationPlaybackSpeed: '1x',
      aiPlaybackDetailLevel: 'standard',
      aiPlaybackAutoSkip: false,
    }, actions);

    expect(sections[0]?.controls[1]).toMatchObject({
      id: 'pause-toggle',
      label: 'Resume',
      kind: 'action',
      disabled: true,
    });
    expect(sections[0]?.controls[2]).toMatchObject({
      id: 'skip-current',
      kind: 'action',
      disabled: true,
    });
  });

  it('hides diagnostics download when no supported diagnostic sink is available', () => {
    const actions = createActions();

    const hiddenSections = buildRunnerControlSections({
      animationPlaying: true,
      animationPaused: false,
      animationPlaybackSpeed: '1x',
      aiPlaybackDetailLevel: 'standard',
      aiPlaybackAutoSkip: false,
    }, actions);
    const visibleSections = buildRunnerControlSections({
      animationPlaying: true,
      animationPaused: false,
      animationPlaybackSpeed: '1x',
      aiPlaybackDetailLevel: 'standard',
      aiPlaybackAutoSkip: false,
    }, actions, {
      diagnostics: {
        available: true,
        download: vi.fn(),
      },
    });

    expect(hiddenSections[2]?.controls[0]).toMatchObject({
      id: 'download-log',
      kind: 'action',
      hidden: true,
    });
    expect(visibleSections[2]?.controls[0]).toMatchObject({
      id: 'download-log',
      kind: 'action',
      hidden: false,
    });
  });
});
