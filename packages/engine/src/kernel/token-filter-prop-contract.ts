export const TOKEN_FILTER_INTRINSIC_PROPS = ['id'] as const;

type TokenFilterIntrinsicProp = typeof TOKEN_FILTER_INTRINSIC_PROPS[number];

export const isIntrinsicTokenFilterProp = (prop: string): prop is TokenFilterIntrinsicProp =>
  TOKEN_FILTER_INTRINSIC_PROPS.includes(prop as TokenFilterIntrinsicProp);

export const isAllowedTokenFilterProp = (prop: string, declaredProps?: readonly string[]): boolean => {
  if (isIntrinsicTokenFilterProp(prop)) {
    return true;
  }

  if (declaredProps === undefined || declaredProps.length === 0) {
    return false;
  }

  return declaredProps.includes(prop);
};

export const tokenFilterPropAlternatives = (declaredProps?: readonly string[]): readonly string[] =>
  [...new Set([...(declaredProps ?? []), ...TOKEN_FILTER_INTRINSIC_PROPS])].sort((left, right) =>
    left.localeCompare(right),
  );
