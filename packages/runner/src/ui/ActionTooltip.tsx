import { useEffect, type ReactElement } from 'react';
import { flip, offset, shift, useFloating } from '@floating-ui/react-dom';
import type {
  AnnotatedActionDescription,
  DisplayGroupNode,
  DisplayInlineNode,
  DisplayLineNode,
  DisplayNode,
} from '@ludoforge/engine/runtime';

import styles from './ActionTooltip.module.css';

const INDENT_PX = 12;

function annotationClass(annotationType: string): string {
  switch (annotationType) {
    case 'pass': return styles.annotationPass ?? '';
    case 'fail': return styles.annotationFail ?? '';
    case 'value': return styles.annotationValue ?? '';
    case 'usage': return styles.annotationUsage ?? '';
    default: return styles.annotation ?? '';
  }
}

function inlineClass(kind: string): string {
  switch (kind) {
    case 'keyword': return styles.keyword ?? '';
    case 'operator': return styles.operator ?? '';
    case 'value': return styles.value ?? '';
    case 'reference': return styles.reference ?? '';
    case 'punctuation': return styles.punctuation ?? '';
    default: return '';
  }
}

function renderInlineNode(node: DisplayInlineNode, key: string): ReactElement {
  if (node.kind === 'annotation') {
    return <span key={key} className={annotationClass(node.annotationType)}>{node.text}</span>;
  }
  return <span key={key} className={inlineClass(node.kind)}>{node.text}</span>;
}

function renderLine(line: DisplayLineNode, key: string): ReactElement {
  return (
    <div
      key={key}
      className={styles.line}
      style={line.indent > 0 ? { paddingLeft: line.indent * INDENT_PX } : undefined}
    >
      {line.children.map((child, i) => renderInlineNode(child, `${key}-i${i}`))}
    </div>
  );
}

function renderNode(node: DisplayNode, key: string): ReactElement {
  switch (node.kind) {
    case 'group':
      return renderGroup(node, key);
    case 'line':
      return renderLine(node, key);
    default:
      return renderInlineNode(node as DisplayInlineNode, key);
  }
}

function renderGroup(group: DisplayGroupNode, key: string): ReactElement {
  return (
    <div key={key} className={styles.group}>
      <span className={styles.groupLabel}>
        {group.icon !== undefined ? `${group.icon} ` : ''}{group.label}
      </span>
      {group.children.map((child, i) => renderNode(child, `${key}-c${i}`))}
    </div>
  );
}

interface ActionTooltipProps {
  readonly description: AnnotatedActionDescription;
  readonly anchorElement: HTMLElement;
}

export function ActionTooltip({ description, anchorElement }: ActionTooltipProps): ReactElement {
  const { x, y, strategy, refs } = useFloating({
    placement: 'top',
    middleware: [offset(12), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(anchorElement);
  }, [refs, anchorElement]);

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
    >
      {description.sections.map((section, i) =>
        renderGroup(section, `s${i}`),
      )}
      {description.limitUsage.length > 0 && (
        <div className={styles.limitFooter} data-testid="limit-footer">
          {description.limitUsage.map((limit, i) => (
            <div key={`${limit.scope}-${i}`} className={styles.limitRow}>
              {capitalize(limit.scope)}: {limit.current} / {limit.max}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
