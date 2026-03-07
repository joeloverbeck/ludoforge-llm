// @vitest-environment jsdom

import { createElement } from 'react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ActionTooltipPayload,
  AnnotatedActionDescription,
  DisplayGroupNode,
  DisplayLineNode,
} from '@ludoforge/engine/runtime';

/* ------------------------------------------------------------------ */
/* Floating UI mock (same pattern as TooltipLayer.test.ts)            */
/* ------------------------------------------------------------------ */

const floatingMocks = vi.hoisted(() => ({
  setReference: vi.fn(),
  setFloating: vi.fn(),
  offset: vi.fn((value: number) => ({ name: 'offset', options: value })),
  flip: vi.fn(() => ({ name: 'flip' })),
  shift: vi.fn((options: { padding: number }) => ({ name: 'shift', options })),
  useFloatingOptions: null as { middleware?: unknown[] } | null,
}));

vi.mock('@floating-ui/react-dom', () => ({
  offset: floatingMocks.offset,
  flip: floatingMocks.flip,
  shift: floatingMocks.shift,
  useFloating: (options: { middleware?: unknown[] }) => {
    floatingMocks.useFloatingOptions = options;
    return {
      x: 100,
      y: 50,
      strategy: 'absolute' as const,
      refs: {
        setReference: floatingMocks.setReference,
        setFloating: floatingMocks.setFloating,
      },
    };
  },
}));

import { ActionTooltip } from '../../src/ui/ActionTooltip.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeAnchor(): HTMLElement {
  return document.createElement('button');
}

function makeDescription(
  overrides: Partial<AnnotatedActionDescription> = {},
): AnnotatedActionDescription {
  return {
    sections: [],
    limitUsage: [],
    ...overrides,
  };
}

function makePreconditionsGroup(): DisplayGroupNode {
  const line: DisplayLineNode = {
    kind: 'line',
    indent: 1,
    children: [
      { kind: 'keyword', text: 'if' },
      { kind: 'reference', text: 'gold', refKind: 'variable' },
      { kind: 'operator', text: '>=' },
      { kind: 'value', text: '5', valueType: 'number' },
      { kind: 'annotation', annotationType: 'pass', text: '(current: 8)' },
    ],
  };
  return {
    kind: 'group',
    label: 'Preconditions',
    children: [line],
  };
}

function makeEffectsGroup(): DisplayGroupNode {
  const line: DisplayLineNode = {
    kind: 'line',
    indent: 0,
    children: [
      { kind: 'keyword', text: 'moveToken' },
      { kind: 'punctuation', text: '(' },
      { kind: 'reference', text: 'soldier', refKind: 'token' },
      { kind: 'punctuation', text: ',' },
      { kind: 'reference', text: 'barracks', refKind: 'zone' },
      { kind: 'punctuation', text: ')' },
    ],
  };
  return {
    kind: 'group',
    label: 'Effects',
    children: [line],
  };
}

/* ------------------------------------------------------------------ */
/* Teardown                                                           */
/* ------------------------------------------------------------------ */

afterEach(() => {
  cleanup();
  floatingMocks.setReference.mockClear();
  floatingMocks.setFloating.mockClear();
  floatingMocks.offset.mockClear();
  floatingMocks.flip.mockClear();
  floatingMocks.shift.mockClear();
  floatingMocks.useFloatingOptions = null;
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ActionTooltip', () => {
  it('renders group labels for Preconditions and Effects sections', () => {
    const desc = makeDescription({
      sections: [makePreconditionsGroup(), makeEffectsGroup()],
    });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    const tooltip = screen.getByTestId('action-tooltip');
    expect(tooltip.textContent).toContain('Preconditions');
    expect(tooltip.textContent).toContain('Effects');
  });

  it('renders inline nodes with correct CSS classes', () => {
    const desc = makeDescription({
      sections: [makeEffectsGroup()],
    });

    const { container } = render(
      createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }),
    );

    const spans = container.querySelectorAll('span');
    const spanArray = Array.from(spans);

    // Find specific inline nodes by text content
    const keywordSpan = spanArray.find((s) => s.textContent === 'moveToken');
    const refSpan = spanArray.find((s) => s.textContent === 'soldier');
    const punctSpan = spanArray.find((s) => s.textContent === '(');

    expect(keywordSpan?.className).toContain('keyword');
    expect(refSpan?.className).toContain('reference');
    expect(punctSpan?.className).toContain('punctuation');
  });

  it('applies pass annotation class', () => {
    const desc = makeDescription({
      sections: [makePreconditionsGroup()],
    });

    const { container } = render(
      createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }),
    );

    const spans = Array.from(container.querySelectorAll('span'));
    const passSpan = spans.find((s) => s.textContent === '(current: 8)');
    expect(passSpan?.className).toContain('annotationPass');
  });

  it('applies fail annotation class', () => {
    const failLine: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [
        { kind: 'annotation', annotationType: 'fail', text: '(FAILED)' },
      ],
    };
    const group: DisplayGroupNode = {
      kind: 'group',
      label: 'Check',
      children: [failLine],
    };
    const desc = makeDescription({ sections: [group] });

    const { container } = render(
      createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }),
    );

    const spans = Array.from(container.querySelectorAll('span'));
    const failSpan = spans.find((s) => s.textContent === '(FAILED)');
    expect(failSpan?.className).toContain('annotationFail');
  });

  it('renders limit usage footer when limitUsage is non-empty', () => {
    const desc = makeDescription({
      sections: [makeEffectsGroup()],
      limitUsage: [
        { id: 'action::turn::0', scope: 'turn', max: 2, current: 1 },
      ],
    });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    const footer = screen.getByTestId('limit-footer');
    expect(footer.textContent).toContain('Turn: 1 / 2');
  });

  it('does not render limit footer when limitUsage is empty', () => {
    const desc = makeDescription({
      sections: [makeEffectsGroup()],
      limitUsage: [],
    });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    expect(screen.queryByTestId('limit-footer')).toBeNull();
  });

  it('renders nested groups recursively without errors', () => {
    const innerLine: DisplayLineNode = {
      kind: 'line',
      indent: 2,
      children: [{ kind: 'keyword', text: 'set' }, { kind: 'value', text: '10' }],
    };
    const innerGroup: DisplayGroupNode = {
      kind: 'group',
      label: 'Inner Block',
      children: [innerLine],
    };
    const outerGroup: DisplayGroupNode = {
      kind: 'group',
      label: 'Outer Block',
      children: [innerGroup],
    };
    const desc = makeDescription({ sections: [outerGroup] });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    const tooltip = screen.getByTestId('action-tooltip');
    expect(tooltip.textContent).toContain('Outer Block');
    expect(tooltip.textContent).toContain('Inner Block');
    expect(tooltip.textContent).toContain('set');
    expect(tooltip.textContent).toContain('10');
  });

  it('applies Floating UI positioning styles to container', () => {
    const desc = makeDescription({ sections: [makeEffectsGroup()] });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    const tooltip = screen.getByTestId('action-tooltip');
    expect(tooltip.style.position).toBe('absolute');
    expect(tooltip.style.left).toBe('100px');
    expect(tooltip.style.top).toBe('50px');
  });

  it('sets reference to anchorElement via Floating UI', () => {
    const anchor = makeAnchor();
    const desc = makeDescription({ sections: [] });

    render(createElement(ActionTooltip, { description: desc, anchorElement: anchor }));

    expect(floatingMocks.setReference).toHaveBeenCalledWith(anchor);
  });

  it('enforces pointer-events: auto via CSS contract', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/ui/ActionTooltip.module.css'),
      'utf-8',
    );
    const tooltipBlock = css.match(/\.tooltip\s*\{[^}]*\}/u)?.[0] ?? '';
    expect(tooltipBlock).toContain('pointer-events: auto;');
  });

  it('enforces overflow-x: hidden via CSS contract', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/ui/ActionTooltip.module.css'),
      'utf-8',
    );
    const tooltipBlock = css.match(/\.tooltip\s*\{[^}]*\}/u)?.[0] ?? '';
    expect(tooltipBlock).toContain('overflow-x: hidden;');
  });

  it('enforces long-token wrapping on display-node inline spans via CSS contract', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/ui/DisplayNodeRenderers.module.css'),
      'utf-8',
    );
    const spanWrapBlock = css.match(/\.line\s*>\s*span\s*\{[^}]*\}/u)?.[0] ?? '';
    expect(spanWrapBlock).toContain('overflow-wrap: anywhere;');
  });

  it('returns null when description has no displayable content', () => {
    const desc = makeDescription({ sections: [], limitUsage: [] });

    const { container } = render(
      createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }),
    );

    expect(screen.queryByTestId('action-tooltip')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('renders tooltip when sections are present but limitUsage is empty', () => {
    const desc = makeDescription({
      sections: [makeEffectsGroup()],
      limitUsage: [],
    });

    render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

    const tooltip = screen.getByTestId('action-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.textContent).toContain('Effects');
  });

  it('fires onPointerEnter when pointer enters tooltip', () => {
    const onPointerEnter = vi.fn();
    const desc = makeDescription({ sections: [makeEffectsGroup()] });

    render(createElement(ActionTooltip, {
      description: desc,
      anchorElement: makeAnchor(),
      onPointerEnter,
    }));

    const tooltip = screen.getByTestId('action-tooltip');
    fireEvent.pointerEnter(tooltip);

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });

  it('fires onPointerLeave when pointer leaves tooltip', () => {
    const onPointerLeave = vi.fn();
    const desc = makeDescription({ sections: [makeEffectsGroup()] });

    render(createElement(ActionTooltip, {
      description: desc,
      anchorElement: makeAnchor(),
      onPointerLeave,
    }));

    const tooltip = screen.getByTestId('action-tooltip');
    fireEvent.pointerLeave(tooltip);

    expect(onPointerLeave).toHaveBeenCalledTimes(1);
  });

  /* -------------------------------------------------------------- */
  /* Progressive Disclosure (tooltipPayload present)                 */
  /* -------------------------------------------------------------- */

  describe('progressive disclosure (tooltipPayload present)', () => {
    function makePayload(overrides: Partial<ActionTooltipPayload> = {}): ActionTooltipPayload {
      return {
        ruleCard: {
          synopsis: 'Train — Select 1-6 target spaces',
          steps: [
            { stepNumber: 1, header: 'Select target spaces', lines: [{ text: 'Choose 1-6 spaces', astPath: 'root.0' }] },
            { stepNumber: 2, header: 'Place forces', lines: [] },
          ],
          modifiers: [
            { condition: 'Shaded', description: '+1 Troop per space' },
            { condition: 'Monsoon', description: 'No air lift' },
          ],
        },
        ruleState: {
          available: true,
          blockers: [],
          activeModifierIndices: [0],
        },
        ...overrides,
      };
    }

    it('renders synopsis when tooltipPayload is present', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      const synopsis = screen.getByTestId('tooltip-synopsis');
      expect(synopsis.textContent).toBe('Train — Select 1-6 target spaces');
    });

    it('renders numbered steps list', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      const steps = screen.getByTestId('tooltip-steps');
      expect(steps.children).toHaveLength(2);
      expect(steps.textContent).toContain('Select target spaces');
      expect(steps.textContent).toContain('Place forces');
    });

    it('renders step detail lines', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      const steps = screen.getByTestId('tooltip-steps');
      expect(steps.textContent).toContain('Choose 1-6 spaces');
    });

    it('renders modifiers section when modifiers exist', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      expect(screen.getByTestId('modifiers-section')).toBeTruthy();
    });

    it('renders availability section', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      expect(screen.getByTestId('availability-section')).toBeTruthy();
      expect(screen.getByTestId('availability-section').textContent).toContain('Available');
    });

    it('renders raw AST toggle when sections are present alongside payload', () => {
      const desc = makeDescription({
        sections: [makeEffectsGroup()],
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      expect(screen.getByTestId('raw-ast-toggle')).toBeTruthy();
    });

    it('does not render raw AST toggle when no sections alongside payload', () => {
      const desc = makeDescription({
        sections: [],
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      expect(screen.queryByTestId('raw-ast-toggle')).toBeNull();
    });

    it('does not render legacy limit footer when payload is present', () => {
      const desc = makeDescription({
        sections: [makeEffectsGroup()],
        limitUsage: [{ id: 'action::turn::0', scope: 'turn', max: 2, current: 1 }],
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      expect(screen.queryByTestId('limit-footer')).toBeNull();
    });

    it('falls back to DisplayNode rendering when tooltipPayload is absent', () => {
      const desc = makeDescription({
        sections: [makeEffectsGroup()],
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      // Legacy rendering: group labels visible, no synopsis
      expect(screen.queryByTestId('tooltip-synopsis')).toBeNull();
      const tooltip = screen.getByTestId('action-tooltip');
      expect(tooltip.textContent).toContain('Effects');
    });

    it('preserves ARIA attributes in progressive disclosure mode', () => {
      const desc = makeDescription({
        tooltipPayload: makePayload(),
      });

      render(createElement(ActionTooltip, { description: desc, anchorElement: makeAnchor() }));

      const tooltip = screen.getByTestId('action-tooltip');
      expect(tooltip.getAttribute('role')).toBe('tooltip');
    });
  });
});
