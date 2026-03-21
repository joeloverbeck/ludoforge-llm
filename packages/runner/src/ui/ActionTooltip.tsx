import type { ReactElement } from 'react';
import { flip, offset, shift } from '@floating-ui/react-dom';
import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import { hasDisplayableContent } from './has-displayable-content.js';
import { renderGroup } from './display-node-renderers.js';
import { ModifiersSection } from './ModifiersSection.js';
import { AvailabilitySection } from './AvailabilitySection.js';
import { RawAstToggle } from './RawAstToggle.js';
import { useResolvedFloatingAnchor } from './useResolvedFloatingAnchor.js';
import type { TooltipCompanionGroup } from './tooltip-companion-actions.js';
import styles from './ActionTooltip.module.css';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ActionTooltipProps {
  readonly description: AnnotatedActionDescription;
  readonly anchorElement: HTMLElement;
  readonly companionGroups?: readonly TooltipCompanionGroup[];
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
}

export function ActionTooltip({
  description,
  anchorElement,
  companionGroups,
  onPointerEnter,
  onPointerLeave,
}: ActionTooltipProps): ReactElement | null {
  const { refs, floatingStyle } = useResolvedFloatingAnchor({
    reference: anchorElement,
    placement: 'top',
    middleware: [offset(12), flip(), shift({ padding: 8 })],
  });

  if (!hasDisplayableContent(description)) {
    return null;
  }

  if (floatingStyle === null) {
    return null;
  }

  const { tooltipPayload } = description;
  const companionSection = companionGroups !== undefined && companionGroups.length > 0 ? (
    <div className={styles.companionSection} data-testid="tooltip-companion-actions">
      {companionGroups.map((group) => (
        <div key={group.actionClass} className={styles.companionGroup}>
          <p className={styles.companionHeader}>{group.groupName}</p>
          <ul className={styles.companionList}>
            {group.actions.map((action) => (
              <li
                key={action.actionId}
                className={action.isAvailable ? styles.companionAvailable : styles.companionUnavailable}
              >
                {action.displayName}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div
      ref={refs.setFloating}
      className={styles.tooltip}
      role="tooltip"
      data-testid="action-tooltip"
      style={floatingStyle}
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
                  <details open className={styles.stepDetails}>
                    <summary className={styles.stepSummary}>{step.header}</summary>
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
                            {sub.lines.length > 0 && (
                              <ul className={styles.stepLines}>
                                {sub.lines.map((line, li) => (
                                  <li key={`sub-${sub.stepNumber}-${li}`} className={styles.stepLine}>
                                    {line.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
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
          {companionSection}
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
          {companionSection}
        </>
      )}
    </div>
  );
}
