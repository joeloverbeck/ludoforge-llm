import type {
  DisplayGroupNode,
  DisplayInlineNode,
  DisplayKeywordNode,
  DisplayLineNode,
  DisplayNode,
  DisplayOperatorNode,
  DisplayPunctuationNode,
  DisplayReferenceNode,
  DisplayValueNode,
} from './display-node.js';
import type {
  ActionDef,
  LimitDef,
  ParamDef,
} from './types.js';
import type {
  AddVarPayload,
  ConditionAST,
  EffectAST,
  NumericValueExpr,
  OptionsQuery,
  PlayerSel,
  Reference,
  SetVarPayload,
  TokenSel,
  TransferVarEndpoint,
  ValueExpr,
  ZoneRef,
  ZoneSel,
} from './types-ast.js';

// ---------------------------------------------------------------------------
// Inline node factories
// ---------------------------------------------------------------------------

const kw = (text: string): DisplayKeywordNode => ({ kind: 'keyword', text });
const op = (text: string): DisplayOperatorNode => ({ kind: 'operator', text });
const val = (text: string, valueType?: DisplayValueNode['valueType']): DisplayValueNode =>
  valueType === undefined ? { kind: 'value', text } : { kind: 'value', text, valueType };
const ref = (text: string, refKind: string): DisplayReferenceNode => ({ kind: 'reference', text, refKind });
const punc = (text: string): DisplayPunctuationNode => ({ kind: 'punctuation', text });
const line = (indent: number, children: readonly DisplayInlineNode[]): DisplayLineNode => ({
  kind: 'line',
  indent,
  children,
});

const group = (label: string, children: readonly DisplayNode[], icon?: string): DisplayGroupNode =>
  icon === undefined ? { kind: 'group', label, children } : { kind: 'group', label, icon, children };

// ---------------------------------------------------------------------------
// Separators
// ---------------------------------------------------------------------------

const COMMA = punc(',');
const SPACE = punc(' ');
const DOT = punc('.');
const LPAREN = punc('(');
const RPAREN = punc(')');
const LBRACKET = punc('[');
const RBRACKET = punc(']');

const spaced = (...nodes: readonly DisplayInlineNode[]): DisplayInlineNode[] => {
  const result: DisplayInlineNode[] = [];
  for (const [i, node] of nodes.entries()) {
    if (i > 0) result.push(SPACE);
    result.push(node);
  }
  return result;
};

const commaSeparated = (items: readonly (readonly DisplayInlineNode[])[]): DisplayInlineNode[] => {
  const result: DisplayInlineNode[] = [];
  for (const [i, item] of items.entries()) {
    if (i > 0) {
      result.push(COMMA);
      result.push(SPACE);
    }
    result.push(...item);
  }
  return result;
};

// ---------------------------------------------------------------------------
// PlayerSel / ZoneRef / TokenSel rendering
// ---------------------------------------------------------------------------

export const playerSelToInlineNodes = (sel: PlayerSel): DisplayInlineNode[] => {
  if (typeof sel === 'string') return [ref(sel, 'player')];
  if ('id' in sel) return [ref(String(sel.id), 'player')];
  if ('chosen' in sel) return [ref(sel.chosen, 'binding')];
  // relative
  return [ref(sel.relative, 'player')];
};

export const zoneRefToInlineNodes = (zone: ZoneRef): DisplayInlineNode[] => {
  if (typeof zone === 'string') return [ref(zone, 'zone')];
  return valueExprToInlineNodes(zone.zoneExpr);
};

const zoneSelToInlineNodes = (zone: ZoneSel): DisplayInlineNode[] => [ref(zone, 'zone')];

const tokenSelToInlineNodes = (token: TokenSel): DisplayInlineNode[] => [ref(token, 'token')];

// ---------------------------------------------------------------------------
// ValueExpr rendering
// ---------------------------------------------------------------------------

const referenceToInlineNodes = (r: Reference): DisplayInlineNode[] => {
  switch (r.ref) {
    case 'gvar':
      return [ref(r.var, 'gvar')];
    case 'pvar':
      return [...playerSelToInlineNodes(r.player), DOT, ref(r.var, 'pvar')];
    case 'zoneVar':
      return [ref(r.zone, 'zone'), DOT, ref(r.var, 'zvar')];
    case 'zoneCount':
      return [kw('count'), LPAREN, ref(r.zone, 'zone'), RPAREN];
    case 'tokenProp':
      return [ref(r.token, 'token'), DOT, ref(r.prop, 'prop')];
    case 'assetField':
      return [ref(r.tableId, 'table'), LBRACKET, ref(r.row, 'row'), RBRACKET, DOT, ref(r.field, 'field')];
    case 'binding':
      return [ref(r.displayName ?? r.name, 'binding')];
    case 'markerState':
      return [ref(r.space, 'zone'), DOT, ref(r.marker, 'marker')];
    case 'globalMarkerState':
      return [ref(r.marker, 'marker')];
    case 'tokenZone':
      return [kw('zoneOf'), LPAREN, ref(r.token, 'token'), RPAREN];
    case 'zoneProp':
      return [ref(r.zone, 'zone'), DOT, ref(r.prop, 'prop')];
    case 'activePlayer':
      return [ref('activePlayer', 'player')];
    default: {
      const _exhaustive: never = r;
      return [kw(String((_exhaustive as Reference).ref))];
    }
  }
};

const isReference = (expr: ValueExpr): expr is Reference =>
  typeof expr === 'object' && expr !== null && 'ref' in expr;

export const valueExprToInlineNodes = (expr: ValueExpr): DisplayInlineNode[] => {
  if (typeof expr === 'number') return [val(String(expr), 'number')];
  if (typeof expr === 'boolean') return [val(String(expr), 'boolean')];
  if (typeof expr === 'string') return [val(JSON.stringify(expr), 'string')];
  if (isReference(expr)) return referenceToInlineNodes(expr);
  if ('op' in expr) {
    return [...valueExprToInlineNodes(expr.left), SPACE, op(expr.op), SPACE, ...valueExprToInlineNodes(expr.right)];
  }
  if ('aggregate' in expr) {
    if (expr.aggregate.op === 'count') {
      return [kw('count'), LPAREN, ...optionsQueryToInlineNodes(expr.aggregate.query), RPAREN];
    }
    return [
      kw(expr.aggregate.op),
      LPAREN,
      ref(expr.aggregate.bind, 'binding'),
      SPACE,
      kw('in'),
      SPACE,
      ...optionsQueryToInlineNodes(expr.aggregate.query),
      COMMA,
      SPACE,
      ...numericValueExprToInlineNodes(expr.aggregate.valueExpr),
      RPAREN,
    ];
  }
  if ('concat' in expr) {
    return [kw('concat'), LPAREN, ...commaSeparated(expr.concat.map(valueExprToInlineNodes)), RPAREN];
  }
  if ('if' in expr) {
    return [
      kw('if'),
      LPAREN,
      ...conditionToInlinePreview(expr.if.when),
      COMMA,
      SPACE,
      ...valueExprToInlineNodes(expr.if.then),
      COMMA,
      SPACE,
      ...valueExprToInlineNodes(expr.if.else),
      RPAREN,
    ];
  }
  return [kw('expr')];
};

const numericValueExprToInlineNodes = (expr: NumericValueExpr): DisplayInlineNode[] =>
  valueExprToInlineNodes(expr as ValueExpr);

// ---------------------------------------------------------------------------
// OptionsQuery rendering
// ---------------------------------------------------------------------------

export const optionsQueryToInlineNodes = (query: OptionsQuery): DisplayInlineNode[] => {
  switch (query.query) {
    case 'tokensInZone':
      return spaced(kw('tokens'), kw('in'), ...zoneRefToInlineNodes(query.zone));
    case 'assetRows':
      return spaced(kw('rows'), kw('from'), ref(query.tableId, 'table'));
    case 'tokensInMapSpaces':
      return [kw('tokens in map spaces')];
    case 'nextInOrderByCondition':
      return spaced(kw('nextInOrder'), kw('from'), ...optionsQueryToInlineNodes(query.source));
    case 'intsInRange':
      return [
        kw('ints'),
        SPACE,
        ...numericValueExprToInlineNodes(query.min),
        op('..'),
        ...numericValueExprToInlineNodes(query.max),
      ];
    case 'intsInVarRange':
      return spaced(kw('range'), kw('of'), ref(query.var, 'gvar'));
    case 'enums':
      return [kw('enum'), LPAREN, ...commaSeparated(query.values.map((v) => [val(JSON.stringify(v), 'string')])), RPAREN];
    case 'globalMarkers':
      return [kw('globalMarkers')];
    case 'players':
      return [kw('players')];
    case 'zones':
      return [kw('zones')];
    case 'mapSpaces':
      return [kw('mapSpaces')];
    case 'adjacentZones':
      return spaced(kw('adjacent'), kw('to'), ...zoneRefToInlineNodes(query.zone));
    case 'tokensInAdjacentZones':
      return spaced(kw('tokens'), kw('adjacent'), kw('to'), ...zoneRefToInlineNodes(query.zone));
    case 'connectedZones':
      return spaced(kw('connected'), kw('to'), ...zoneRefToInlineNodes(query.zone));
    case 'binding':
      return [ref(query.displayName ?? query.name, 'binding')];
    case 'concat':
      return [
        kw('concat'),
        LPAREN,
        ...commaSeparated(query.sources.map(optionsQueryToInlineNodes)),
        RPAREN,
      ];
    default: {
      const _exhaustive: never = query;
      return [kw((_exhaustive as OptionsQuery).query)];
    }
  }
};

// ---------------------------------------------------------------------------
// ConditionAST rendering
// ---------------------------------------------------------------------------

type ConditionLeaf = Exclude<ConditionAST, boolean | { readonly op: 'and' | 'or' | 'not' }>;

const conditionLeafToInlineNodes = (cond: ConditionLeaf): DisplayInlineNode[] => {
  switch (cond.op) {
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return [...valueExprToInlineNodes(cond.left), SPACE, op(cond.op), SPACE, ...valueExprToInlineNodes(cond.right)];
    case 'in':
      return [...valueExprToInlineNodes(cond.item), SPACE, kw('in'), SPACE, ...valueExprToInlineNodes(cond.set)];
    case 'adjacent':
      return spaced(...zoneSelToInlineNodes(cond.left), kw('adjacent'), ...zoneSelToInlineNodes(cond.right));
    case 'connected': {
      const nodes: DisplayInlineNode[] = spaced(
        ...zoneSelToInlineNodes(cond.from),
        kw('connected'),
        ...zoneSelToInlineNodes(cond.to),
      );
      if (cond.via !== undefined) {
        nodes.push(SPACE, kw('via'), SPACE, ...conditionToInlinePreview(cond.via));
      }
      if (cond.maxDepth !== undefined) {
        nodes.push(SPACE, kw('maxDepth'), SPACE, val(String(cond.maxDepth), 'number'));
      }
      return nodes;
    }
    case 'zonePropIncludes':
      return [
        ...zoneSelToInlineNodes(cond.zone),
        DOT,
        ref(cond.prop, 'prop'),
        SPACE,
        kw('includes'),
        SPACE,
        ...valueExprToInlineNodes(cond.value),
      ];
    default: {
      const _exhaustive: never = cond;
      return [kw(String((_exhaustive as { readonly op: string }).op))];
    }
  }
};

const conditionToInlinePreview = (cond: ConditionAST): DisplayInlineNode[] => {
  if (typeof cond === 'boolean') return [val(String(cond), 'boolean')];
  switch (cond.op) {
    case 'and':
    case 'or':
      return [kw(cond.op), LPAREN, ...commaSeparated(cond.args.map(conditionToInlinePreview)), RPAREN];
    case 'not':
      return [kw('not'), LPAREN, ...conditionToInlinePreview(cond.arg), RPAREN];
    default:
      return conditionLeafToInlineNodes(cond);
  }
};

export const conditionToDisplayNodes = (cond: ConditionAST, indent: number): DisplayNode[] => {
  if (typeof cond === 'boolean') {
    return [line(indent, [val(String(cond), 'boolean')])];
  }

  switch (cond.op) {
    case 'and':
    case 'or': {
      const header = line(indent, [kw(cond.op)]);
      const children = cond.args.flatMap((arg) => conditionToDisplayNodes(arg, indent + 1));
      return [header, ...children];
    }
    case 'not': {
      const header = line(indent, [kw('not')]);
      const children = conditionToDisplayNodes(cond.arg, indent + 1);
      return [header, ...children];
    }
    default:
      return [line(indent, conditionLeafToInlineNodes(cond))];
  }
};

// ---------------------------------------------------------------------------
// Scoped var helpers
// ---------------------------------------------------------------------------

const scopedVarTarget = (
  payload: SetVarPayload | AddVarPayload,
): DisplayInlineNode[] => {
  if (payload.scope === 'global') return [ref(payload.var, 'gvar')];
  if (payload.scope === 'pvar') return [...playerSelToInlineNodes(payload.player), DOT, ref(payload.var, 'pvar')];
  return [...zoneRefToInlineNodes(payload.zone), DOT, ref(payload.var, 'zvar')];
};

const transferEndpointToInlineNodes = (ep: TransferVarEndpoint): DisplayInlineNode[] => {
  if (ep.scope === 'global') return [ref(ep.var, 'gvar')];
  if (ep.scope === 'pvar') return [...playerSelToInlineNodes(ep.player), DOT, ref(ep.var, 'pvar')];
  return [...zoneRefToInlineNodes(ep.zone), DOT, ref(ep.var, 'zvar')];
};

// ---------------------------------------------------------------------------
// EffectAST rendering
// ---------------------------------------------------------------------------

const effectsToDisplayNodes = (effects: readonly EffectAST[], indent: number): DisplayNode[] =>
  effects.flatMap((e) => effectToDisplayNodes(e, indent));

export const effectToDisplayNodes = (effect: EffectAST, indent: number): DisplayNode[] => {
  // --- Variable effects ---
  if ('setVar' in effect) {
    return [line(indent, spaced(kw('set'), ...scopedVarTarget(effect.setVar), op('='), ...valueExprToInlineNodes(effect.setVar.value)))];
  }
  if ('addVar' in effect) {
    return [line(indent, spaced(kw('add'), ...numericValueExprToInlineNodes(effect.addVar.delta), kw('to'), ...scopedVarTarget(effect.addVar)))];
  }
  if ('setActivePlayer' in effect) {
    return [line(indent, spaced(kw('setActivePlayer'), ...playerSelToInlineNodes(effect.setActivePlayer.player)))];
  }
  if ('transferVar' in effect) {
    return [line(indent, spaced(
      kw('transfer'),
      ...numericValueExprToInlineNodes(effect.transferVar.amount),
      kw('from'),
      ...transferEndpointToInlineNodes(effect.transferVar.from),
      kw('to'),
      ...transferEndpointToInlineNodes(effect.transferVar.to),
    ))];
  }

  // --- Token effects ---
  if ('moveToken' in effect) {
    const nodes = spaced(
      kw('move'),
      ...tokenSelToInlineNodes(effect.moveToken.token),
      kw('from'),
      ...zoneRefToInlineNodes(effect.moveToken.from),
      kw('to'),
      ...zoneRefToInlineNodes(effect.moveToken.to),
    );
    if (effect.moveToken.position !== undefined) {
      nodes.push(SPACE, kw(effect.moveToken.position));
    }
    return [line(indent, nodes)];
  }
  if ('moveAll' in effect) {
    return [line(indent, spaced(kw('moveAll'), kw('from'), ...zoneRefToInlineNodes(effect.moveAll.from), kw('to'), ...zoneRefToInlineNodes(effect.moveAll.to)))];
  }
  if ('moveTokenAdjacent' in effect) {
    const nodes = spaced(kw('moveAdjacent'), ...tokenSelToInlineNodes(effect.moveTokenAdjacent.token), kw('from'), ...zoneRefToInlineNodes(effect.moveTokenAdjacent.from));
    if (effect.moveTokenAdjacent.direction !== undefined) {
      nodes.push(SPACE, kw(effect.moveTokenAdjacent.direction));
    }
    return [line(indent, nodes)];
  }
  if ('draw' in effect) {
    return [line(indent, spaced(kw('draw'), val(String(effect.draw.count), 'number'), kw('from'), ...zoneRefToInlineNodes(effect.draw.from), kw('to'), ...zoneRefToInlineNodes(effect.draw.to)))];
  }
  if ('reveal' in effect) {
    return [line(indent, spaced(kw('reveal'), ...zoneRefToInlineNodes(effect.reveal.zone)))];
  }
  if ('conceal' in effect) {
    return [line(indent, spaced(kw('conceal'), ...zoneRefToInlineNodes(effect.conceal.zone)))];
  }
  if ('shuffle' in effect) {
    return [line(indent, spaced(kw('shuffle'), ...zoneRefToInlineNodes(effect.shuffle.zone)))];
  }
  if ('createToken' in effect) {
    return [line(indent, spaced(kw('create'), ref(effect.createToken.type, 'tokenType'), kw('in'), ...zoneRefToInlineNodes(effect.createToken.zone)))];
  }
  if ('destroyToken' in effect) {
    return [line(indent, spaced(kw('destroy'), ...tokenSelToInlineNodes(effect.destroyToken.token)))];
  }
  if ('setTokenProp' in effect) {
    return [line(indent, spaced(
      kw('set'),
      ...tokenSelToInlineNodes(effect.setTokenProp.token),
      DOT,
      ref(effect.setTokenProp.prop, 'prop'),
      op('='),
      ...valueExprToInlineNodes(effect.setTokenProp.value),
    ))];
  }

  // --- Compound / control flow effects ---
  if ('if' in effect) {
    const nodes: DisplayNode[] = [
      line(indent, [kw('if'), SPACE, ...conditionToInlinePreview(effect.if.when)]),
      ...effectsToDisplayNodes(effect.if.then, indent + 1),
    ];
    if (effect.if.else !== undefined && effect.if.else.length > 0) {
      nodes.push(line(indent, [kw('else')]));
      nodes.push(...effectsToDisplayNodes(effect.if.else, indent + 1));
    }
    return nodes;
  }
  if ('forEach' in effect) {
    return [
      line(indent, spaced(kw('forEach'), ref(effect.forEach.macroOrigin?.stem ?? effect.forEach.bind, 'binding'), kw('in'), ...optionsQueryToInlineNodes(effect.forEach.over))),
      ...effectsToDisplayNodes(effect.forEach.effects, indent + 1),
    ];
  }
  if ('reduce' in effect) {
    return [
      line(indent, spaced(
        kw('reduce'),
        ref(effect.reduce.macroOrigin?.stem ?? effect.reduce.itemBind, 'binding'),
        kw('in'),
        ...optionsQueryToInlineNodes(effect.reduce.over),
        kw('acc'),
        ref(effect.reduce.accBind, 'binding'),
        op('='),
        ...valueExprToInlineNodes(effect.reduce.initial),
      )),
      line(indent + 1, spaced(kw('next'), op('='), ...valueExprToInlineNodes(effect.reduce.next))),
      ...effectsToDisplayNodes(effect.reduce.in, indent + 1),
    ];
  }
  if ('removeByPriority' in effect) {
    const nodes: DisplayNode[] = [
      line(indent, spaced(kw('removeByPriority'), kw('budget'), ...numericValueExprToInlineNodes(effect.removeByPriority.budget))),
    ];
    for (const g of effect.removeByPriority.groups) {
      nodes.push(line(indent + 1, spaced(ref(g.bind, 'binding'), kw('in'), ...optionsQueryToInlineNodes(g.over), kw('to'), ...zoneRefToInlineNodes(g.to))));
    }
    if (effect.removeByPriority.in !== undefined) {
      nodes.push(...effectsToDisplayNodes(effect.removeByPriority.in, indent + 1));
    }
    return nodes;
  }
  if ('let' in effect) {
    return [
      line(indent, spaced(kw('let'), ref(effect.let.macroOrigin?.stem ?? effect.let.bind, 'binding'), op('='), ...valueExprToInlineNodes(effect.let.value))),
      ...effectsToDisplayNodes(effect.let.in, indent + 1),
    ];
  }
  if ('bindValue' in effect) {
    return [line(indent, spaced(kw('bind'), ref(effect.bindValue.macroOrigin?.stem ?? effect.bindValue.bind, 'binding'), op('='), ...valueExprToInlineNodes(effect.bindValue.value)))];
  }
  if ('evaluateSubset' in effect) {
    return [
      line(indent, spaced(kw('evaluateSubset'), kw('from'), ...optionsQueryToInlineNodes(effect.evaluateSubset.source))),
      ...effectsToDisplayNodes(effect.evaluateSubset.compute, indent + 1),
      ...effectsToDisplayNodes(effect.evaluateSubset.in, indent + 1),
    ];
  }

  // --- Choice effects ---
  if ('chooseOne' in effect) {
    return [line(indent, spaced(kw('choose'), ref(effect.chooseOne.macroOrigin?.stem ?? effect.chooseOne.bind, 'binding'), kw('from'), ...optionsQueryToInlineNodes(effect.chooseOne.options)))];
  }
  if ('chooseN' in effect) {
    return [line(indent, spaced(kw('chooseN'), ref(effect.chooseN.macroOrigin?.stem ?? effect.chooseN.bind, 'binding'), kw('from'), ...optionsQueryToInlineNodes(effect.chooseN.options)))];
  }
  if ('rollRandom' in effect) {
    return [
      line(indent, spaced(
        kw('roll'),
        ref(effect.rollRandom.macroOrigin?.stem ?? effect.rollRandom.bind, 'binding'),
        kw('in'),
        ...numericValueExprToInlineNodes(effect.rollRandom.min),
        op('..'),
        ...numericValueExprToInlineNodes(effect.rollRandom.max),
      )),
      ...effectsToDisplayNodes(effect.rollRandom.in, indent + 1),
    ];
  }

  // --- Marker effects ---
  if ('setMarker' in effect) {
    return [line(indent, spaced(kw('setMarker'), ...zoneRefToInlineNodes(effect.setMarker.space), DOT, ref(effect.setMarker.marker, 'marker'), op('='), ...valueExprToInlineNodes(effect.setMarker.state)))];
  }
  if ('shiftMarker' in effect) {
    return [line(indent, spaced(kw('shiftMarker'), ...zoneRefToInlineNodes(effect.shiftMarker.space), DOT, ref(effect.shiftMarker.marker, 'marker'), kw('by'), ...numericValueExprToInlineNodes(effect.shiftMarker.delta)))];
  }
  if ('setGlobalMarker' in effect) {
    return [line(indent, spaced(kw('setGlobalMarker'), ref(effect.setGlobalMarker.marker, 'marker'), op('='), ...valueExprToInlineNodes(effect.setGlobalMarker.state)))];
  }
  if ('flipGlobalMarker' in effect) {
    return [line(indent, spaced(
      kw('flipGlobalMarker'),
      ...valueExprToInlineNodes(effect.flipGlobalMarker.marker),
      kw('between'),
      ...valueExprToInlineNodes(effect.flipGlobalMarker.stateA),
      op('/'),
      ...valueExprToInlineNodes(effect.flipGlobalMarker.stateB),
    ))];
  }
  if ('shiftGlobalMarker' in effect) {
    return [line(indent, spaced(kw('shiftGlobalMarker'), ref(effect.shiftGlobalMarker.marker, 'marker'), kw('by'), ...numericValueExprToInlineNodes(effect.shiftGlobalMarker.delta)))];
  }

  // --- Turn flow effects ---
  if ('grantFreeOperation' in effect) {
    return [line(indent, spaced(kw('grantFreeOp'), ref(effect.grantFreeOperation.seat, 'player'), kw(effect.grantFreeOperation.operationClass)))];
  }
  if ('gotoPhaseExact' in effect) {
    return [line(indent, spaced(kw('goto'), ref(effect.gotoPhaseExact.phase, 'phase')))];
  }
  if ('advancePhase' in effect) {
    return [line(indent, [kw('advancePhase')])];
  }
  if ('pushInterruptPhase' in effect) {
    return [line(indent, spaced(kw('pushInterrupt'), ref(effect.pushInterruptPhase.phase, 'phase')))];
  }
  if ('popInterruptPhase' in effect) {
    return [line(indent, [kw('popInterrupt')])];
  }

  const _exhaustive: never = effect;
  return [line(indent, [kw(Object.keys(_exhaustive as Record<string, unknown>)[0] ?? 'unknown')])];
};

// ---------------------------------------------------------------------------
// ActionDef → display tree
// ---------------------------------------------------------------------------

const paramToDisplayLine = (param: ParamDef, indent: number): DisplayLineNode =>
  line(indent, spaced(ref(param.name, 'param'), kw('from'), ...optionsQueryToInlineNodes(param.domain)));

const limitToDisplayLine = (limit: LimitDef, indent: number): DisplayLineNode =>
  line(indent, spaced(val(String(limit.max), 'number'), kw('per'), kw(limit.scope)));

export const actionDefToDisplayTree = (action: ActionDef): readonly DisplayGroupNode[] => {
  const sections: DisplayGroupNode[] = [];

  if (action.params.length > 0) {
    sections.push(group(
      'Parameters',
      action.params.map((p) => paramToDisplayLine(p, 0)),
    ));
  }

  if (action.pre !== null) {
    sections.push(group(
      'Preconditions',
      conditionToDisplayNodes(action.pre, 0),
      'check',
    ));
  }

  if (action.cost.length > 0) {
    sections.push(group(
      'Costs',
      action.cost.flatMap((e) => effectToDisplayNodes(e, 0)),
      'cost',
    ));
  }

  if (action.effects.length > 0) {
    sections.push(group(
      'Effects',
      action.effects.flatMap((e) => effectToDisplayNodes(e, 0)),
    ));
  }

  if (action.limits.length > 0) {
    sections.push(group(
      'Limits',
      action.limits.map((l) => limitToDisplayLine(l, 0)),
      'limit',
    ));
  }

  return sections;
};
