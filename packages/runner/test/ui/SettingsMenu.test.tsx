// @vitest-environment jsdom

import { useRef, useState, type ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsMenu } from '../../src/ui/SettingsMenu.js';
import { SettingsMenuTrigger } from '../../src/ui/SettingsMenuTrigger.js';
import type { RunnerControlSection } from '../../src/ui/runner-control-surface.js';

afterEach(() => {
  cleanup();
});

describe('SettingsMenu', () => {
  it('renders grouped descriptor sections and control labels without store access', () => {
    const sections = createSections();

    render(
      <MenuHarness
        initialOpen
        sections={sections}
      />,
    );

    expect(screen.getByTestId('settings-menu-section-playback')).toBeTruthy();
    expect(screen.getByTestId('settings-menu-section-ai-playback')).toBeTruthy();
    expect(screen.getByText('Animation speed')).toBeTruthy();
    expect(screen.getByText('AI Detail')).toBeTruthy();
    expect(screen.getByText('AI Auto-Skip')).toBeTruthy();
    expect(screen.getByText('Download Log')).toBeTruthy();
  });

  it('closes on outside click and on Escape', async () => {
    render(
      <MenuHarness
        initialOpen
        sections={createSections()}
      />,
    );

    expect(screen.getByTestId('settings-menu')).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId('outside-click-target'));

    await waitFor(() => {
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('settings-menu-trigger'));
    expect(screen.getByTestId('settings-menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });
  });

  it('links the trigger and menu with stable accessibility attributes', () => {
    render(
      <MenuHarness
        initialOpen
        sections={createSections()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Settings' });
    const menu = screen.getByRole('dialog');
    const menuId = menu.getAttribute('id');

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(menuId);
    expect(menu.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'));
  });

  it('moves focus between menu items with arrow keys and home/end', () => {
    render(
      <MenuHarness
        initialOpen
        sections={[
          {
            id: 'playback',
            label: 'Playback',
            controls: [
              {
                id: 'pause-toggle',
                kind: 'action',
                label: 'Pause',
                onSelect: vi.fn(),
              },
              {
                id: 'skip-current',
                kind: 'action',
                label: 'Skip',
                onSelect: vi.fn(),
              },
              {
                id: 'download-log',
                kind: 'action',
                label: 'Download Log',
                onSelect: vi.fn(),
              },
            ],
          },
        ]}
      />,
    );

    const pauseButton = screen.getByTestId('settings-control-pause-toggle');
    const skipButton = screen.getByTestId('settings-control-skip-current');
    const downloadButton = screen.getByTestId('settings-control-download-log');

    expect(document.activeElement).toBe(pauseButton);

    fireEvent.keyDown(pauseButton, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(skipButton);

    fireEvent.keyDown(skipButton, { key: 'End' });
    expect(document.activeElement).toBe(downloadButton);

    fireEvent.keyDown(downloadButton, { key: 'Home' });
    expect(document.activeElement).toBe(pauseButton);

    fireEvent.keyDown(pauseButton, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(downloadButton);
  });

  it('closes after selecting a one-shot action', async () => {
    const onSelect = vi.fn();

    render(
      <MenuHarness
        initialOpen
        sections={[
          {
            id: 'diagnostics',
            label: 'Diagnostics',
            controls: [
              {
                id: 'download-log',
                kind: 'action',
                label: 'Download Log',
                onSelect,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('settings-control-download-log'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });
  });
});

function MenuHarness({
  sections,
  initialOpen = false,
}: {
  readonly sections: readonly RunnerControlSection[];
  readonly initialOpen?: boolean;
}): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const menuId = 'settings-menu-test';
  const triggerId = 'settings-menu-trigger-test';

  return (
    <div>
      <SettingsMenuTrigger
        ref={triggerRef}
        id={triggerId}
        menuId={menuId}
        open={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      />
      <button type="button" data-testid="outside-click-target">
        Outside
      </button>
      <SettingsMenu
        id={menuId}
        triggerId={triggerId}
        triggerRef={triggerRef}
        open={open}
        sections={sections}
        onClose={() => {
          setOpen(false);
        }}
      />
    </div>
  );
}

function createSections(): readonly RunnerControlSection[] {
  return [
    {
      id: 'playback',
      label: 'Playback',
      controls: [
        {
          id: 'speed',
          kind: 'segmented',
          label: 'Animation speed',
          value: '2x',
          options: [
            { value: '1x', label: '1x' },
            { value: '2x', label: '2x' },
            { value: '4x', label: '4x' },
          ],
          onSelect: vi.fn(),
        },
      ],
    },
    {
      id: 'ai-playback',
      label: 'AI Playback',
      controls: [
        {
          id: 'ai-detail-level',
          kind: 'select',
          label: 'AI Detail',
          value: 'standard',
          options: [
            { value: 'full', label: 'Full' },
            { value: 'standard', label: 'Standard' },
            { value: 'minimal', label: 'Minimal' },
          ],
          onSelect: vi.fn(),
        },
        {
          id: 'ai-auto-skip',
          kind: 'toggle',
          label: 'AI Auto-Skip',
          checked: true,
          onToggle: vi.fn(),
        },
      ],
    },
    {
      id: 'diagnostics',
      label: 'Diagnostics',
      controls: [
        {
          id: 'download-log',
          kind: 'action',
          label: 'Download Log',
          onSelect: vi.fn(),
        },
      ],
    },
  ];
}
