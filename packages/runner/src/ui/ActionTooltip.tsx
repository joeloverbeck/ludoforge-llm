import { useEffect, type ReactElement } from 'react';
import { flip, offset, shift, useFloating } from '@floating-ui/react-dom';
import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import { hasDisplayableContent } from './has-displayable-content.js';
import { renderGroup } from './display-node-renderers.js';
import { ModifiersSection } from './ModifiersSection.js';
import { AvailabilitySection } from './AvailabilitySection.js';
import { RawAstToggle } from './RawAstToggle.js';
import styles from './ActionTooltip.module.css';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ActionTooltipProps {
  readonly description: AnnotatedActionDescription;
  readonly anchorElement: HTMLElement;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
}

export function ActionTooltip({ description, anchorElement, onPointerEnter, onPointerLeave }: ActionTooltipProps): ReactElement | null {
  const { x, y, strategy, refs } = useFloating({
    placement: 'top',
    middleware: [offset(12), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(anchorElement);
  }, [refs, anchorElement]);

  if (!hasDisplayableContent(description)) {
    return null;
  }

  const { tooltipPayload } = description;

  return (
    <div
      ref={refs.setFloating}
      className={styles.tooltip}
      role="tooltip"
      data-testid="action-tooltip"
      style={{
        position: strategy,
        left: x ?? 0,
        top: y ?? 0,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {tooltipPayload !== undefined ? (
        <>
          <div className={styles.synopsis} data-testid="tooltip-synopsis">
            {tooltipPayload.ruleCard.synopsis}
          </div>
          {tooltipPayload.ruleCard.steps.length > 0 && (
            <ol className={styles.stepsList} data-testid="tooltip-steps">
              {tooltipPayload.ruleCard.steps.map((step) => (
                <li key={step.stepNumber} className={styles.stepItem}>
                  <span className={styles.stepHeader}>{step.header}</span>
                  {step.lines.length > 0 && (
                    <ul className={styles.stepLines}>
                      {step.lines.map((line, li) => (
                        <li key={`${step.stepNumber}-${li}`} className={styles.stepLine}>
                          {line.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {step.subSteps !== undefined && step.subSteps.length > 0 && (
                    <ol className={styles.subSteps}>
                      {step.subSteps.map((sub) => (
                        <li key={sub.stepNumber} className={styles.stepItem}>
                          <span className={styles.stepHeader}>{sub.header}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {step.collapsedCount !== undefined && step.collapsedCount > 0 && (
                    <div className={styles.collapsedHint}>
                      and {step.collapsedCount} more...
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {tooltipPayload.ruleCard.modifiers.length > 0 && (
            <ModifiersSection
              modifiers={tooltipPayload.ruleCard.modifiers}
              activeModifierIndices={tooltipPayload.ruleState.activeModifierIndices}
            />
          )}
          <AvailabilitySection ruleState={tooltipPayload.ruleState} />
          {description.sections.length > 0 && (
            <RawAstToggle sections={description.sections} />
          )}
        </>
      ) : (
        <>
          {description.sections.map((section, i) =>
            renderGroup(section, `s${i}`),
          )}
          {description.limitUsage.length > 0 && (
            <div className={styles.limitFooter} data-testid="limit-footer">
              {description.limitUsage.map((limit) => (
                <div key={limit.id} className={styles.limitRow}>
                  {capitalize(limit.scope)}: {limit.current} / {limit.max}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
