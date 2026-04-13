const conditionalObjectSpread = (node) =>
  node.type === "SpreadElement"
  && node.argument.type === "ConditionalExpression"
  && (
    node.argument.consequent.type === "ObjectExpression"
    || node.argument.alternate.type === "ObjectExpression"
  );

const propertyName = (node) => {
  if (node.type !== "Property" || node.computed) {
    return null;
  }
  if (node.key.type === "Identifier") {
    return node.key.name;
  }
  if (node.key.type === "Literal" && typeof node.key.value === "string") {
    return node.key.value;
  }
  return null;
};

const HOT_PATH_SHAPES = [
  {
    required: new Set(["state", "rng", "bindings", "decisionScope", "effectPath"]),
    universe: new Set(["state", "rng", "bindings", "decisionScope", "effectPath", "tracker"]),
    minProperties: 5,
  },
  {
    required: new Set(["move", "viability"]),
    universe: new Set(["move", "viability", "trustedMove"]),
    minProperties: 2,
  },
  {
    required: new Set(["kind", "metadata"]),
    universe: new Set([
      "kind",
      "move",
      "rng",
      "failure",
      "fallbackMove",
      "fallbackStableMoveKey",
      "fallbackScore",
      "metadata",
    ]),
    minProperties: 4,
  },
  {
    required: new Set(["viable", "code", "error"]),
    universe: new Set([
      "viable",
      "complete",
      "move",
      "warnings",
      "code",
      "context",
      "error",
      "nextDecision",
      "nextDecisionSet",
      "stochasticDecision",
    ]),
    minProperties: 7,
  },
  {
    required: new Set([
      "globalVars",
      "perPlayerVars",
      "zoneVars",
      "playerCount",
      "zones",
      "nextTokenOrdinal",
      "currentPhase",
      "activePlayer",
      "turnCount",
      "rng",
      "stateHash",
      "_runningHash",
      "actionUsage",
      "turnOrderState",
      "markers",
    ]),
    universe: new Set([
      "globalVars",
      "perPlayerVars",
      "zoneVars",
      "playerCount",
      "zones",
      "nextTokenOrdinal",
      "currentPhase",
      "activePlayer",
      "turnCount",
      "rng",
      "stateHash",
      "_runningHash",
      "actionUsage",
      "turnOrderState",
      "markers",
      "reveals",
      "globalMarkers",
      "activeLastingEffects",
      "interruptPhaseStack",
    ]),
    minProperties: 15,
  },
];

const matchesHotPathShape = (node) => {
  const keys = node.properties
    .map(propertyName)
    .filter((key) => key !== null);
  const keySet = new Set(
    node.properties
      .map(propertyName)
      .filter((key) => key !== null),
  );
  return HOT_PATH_SHAPES.some((shape) =>
    keys.length >= shape.minProperties
    && keys.every((key) => shape.universe.has(key))
    && Array.from(shape.required).every((key) => keySet.has(key))
  );
};

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow conditional object spreads when constructing canonical hot-path runtime objects.",
    },
    schema: [],
    messages: {
      conditionalSpread:
        "Avoid conditional object spreads when constructing canonical hot-path runtime objects; materialize the property with undefined instead.",
    },
  },
  create(context) {
    return {
      ObjectExpression(node) {
        if (!matchesHotPathShape(node)) {
          return;
        }
        for (const property of node.properties) {
          if (conditionalObjectSpread(property)) {
            context.report({
              node: property,
              messageId: "conditionalSpread",
            });
          }
        }
      },
    };
  },
};
