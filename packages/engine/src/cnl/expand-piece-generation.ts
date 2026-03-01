import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type {
  GameSpecDataAsset,
  GameSpecDoc,
  GameSpecPieceGenerateBlock,
  GameSpecPieceGenerateDerivedProp,
  GameSpecPieceGenerateDimension,
} from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGenerateEntry(entry: unknown): entry is GameSpecPieceGenerateBlock {
  return isRecord(entry) && isRecord((entry as Record<string, unknown>).generate);
}

// ---------------------------------------------------------------------------
// Cartesian product (deterministic: first dimension = outer loop)
// ---------------------------------------------------------------------------

function cartesianProduct(
  dimensions: readonly GameSpecPieceGenerateDimension[],
): readonly Readonly<Record<string, string | number>>[] {
  if (dimensions.length === 0) {
    return [{}];
  }
  // Safe: length checked above
  const head = dimensions[0] as GameSpecPieceGenerateDimension;
  const tail = dimensions.slice(1);
  const rest = cartesianProduct(tail);
  const results: Readonly<Record<string, string | number>>[] = [];
  for (const value of head.values) {
    for (const combo of rest) {
      results.push({ ...combo, [head.name]: value });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Derived prop evaluation
// ---------------------------------------------------------------------------

function evaluateDerivedProp(
  propDef: GameSpecPieceGenerateDerivedProp,
  combination: Readonly<Record<string, string | number>>,
): string | number {
  const rawValue = combination[propDef.from];
  const sourceValue = rawValue !== undefined ? String(rawValue) : '';
  if (sourceValue in propDef.map) {
    return propDef.map[sourceValue] as string | number;
  }
  if (propDef.default !== undefined) {
    return propDef.default.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const val = combination[name];
      if (val !== undefined) {
        return String(val);
      }
      return `{${name}}`;
    });
  }
  return sourceValue;
}

// ---------------------------------------------------------------------------
// Pattern substitution
// ---------------------------------------------------------------------------

function substitutePattern(
  pattern: string,
  values: Readonly<Record<string, string | number>>,
): { readonly id: string; readonly unresolvedPlaceholders: readonly string[] } {
  const unresolved: string[] = [];
  const id = pattern.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (name in values) {
      return String(values[name]);
    }
    unresolved.push(name);
    return `{${name}}`;
  });
  return { id, unresolvedPlaceholders: unresolved };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateGenerateBlock(
  block: GameSpecPieceGenerateBlock['generate'],
  path: string,
  diagnostics: Diagnostic[],
): boolean {
  let valid = true;

  // Structural validity
  if (
    typeof block.idPattern !== 'string' ||
    typeof block.seat !== 'string' ||
    !Array.isArray(block.statusDimensions) ||
    !Array.isArray(block.transitions) ||
    !Array.isArray(block.dimensions) ||
    typeof block.inventoryPerCombination !== 'number'
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_BLOCK_INVALID,
      path,
      severity: 'error',
      message: 'generate block is structurally invalid (missing or wrongly-typed fields).',
    });
    return false;
  }

  // idPattern must have at least one placeholder
  if (!/\{(\w+)\}/.test(block.idPattern)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_ID_PATTERN_NO_PLACEHOLDER,
      path: `${path}.idPattern`,
      severity: 'error',
      message: `idPattern "${block.idPattern}" contains no {placeholder} references.`,
    });
    valid = false;
  }

  // dimensions must not be empty
  if (block.dimensions.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DIMENSIONS_EMPTY,
      path: `${path}.dimensions`,
      severity: 'error',
      message: 'dimensions array must have at least one entry.',
    });
    valid = false;
  }

  // Check each dimension
  const seenDimNames = new Set<string>();
  for (const [dimIdx, dim] of block.dimensions.entries()) {
    const dimPath = `${path}.dimensions[${dimIdx}]`;

    if (seenDimNames.has(dim.name)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DUPLICATE_DIMENSION_NAME,
        path: dimPath,
        severity: 'error',
        message: `Duplicate dimension name "${dim.name}".`,
      });
      valid = false;
    }
    seenDimNames.add(dim.name);

    if (dim.values.length === 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DIMENSION_VALUES_EMPTY,
        path: `${dimPath}.values`,
        severity: 'error',
        message: `Dimension "${dim.name}" has no values.`,
      });
      valid = false;
    }
  }

  // derivedProps.from must reference a known dimension
  if (block.derivedProps !== undefined) {
    for (const [propName, propDef] of Object.entries(block.derivedProps)) {
      if (!seenDimNames.has(propDef.from)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DERIVED_PROP_FROM_UNKNOWN,
          path: `${path}.derivedProps.${propName}.from`,
          severity: 'error',
          message: `derivedProps "${propName}" references unknown dimension "${propDef.from}".`,
        });
        valid = false;
      }
    }
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Per-asset expansion
// ---------------------------------------------------------------------------

interface PieceCatalogPayload {
  readonly pieceTypes: readonly unknown[];
  readonly inventory: readonly unknown[];
}

function isPieceCatalogPayload(payload: unknown): payload is PieceCatalogPayload {
  if (!isRecord(payload)) return false;
  return Array.isArray(payload.pieceTypes) && Array.isArray(payload.inventory);
}

function expandPieceCatalogAsset(
  payload: PieceCatalogPayload,
  assetPath: string,
  diagnostics: Diagnostic[],
): PieceCatalogPayload {
  const expandedPieceTypes: unknown[] = [];
  const expandedInventory: unknown[] = [...payload.inventory];

  for (const [entryIdx, entry] of payload.pieceTypes.entries()) {
    if (!isGenerateEntry(entry)) {
      expandedPieceTypes.push(entry);
      continue;
    }

    const genBlock = entry.generate;
    const blockPath = `${assetPath}.pieceTypes[${entryIdx}].generate`;

    if (!validateGenerateBlock(genBlock, blockPath, diagnostics)) {
      continue;
    }

    const combinations = cartesianProduct(genBlock.dimensions);

    for (const combo of combinations) {
      // Evaluate derived props
      const derivedValues: Record<string, string | number> = {};
      if (genBlock.derivedProps !== undefined) {
        for (const [propName, propDef] of Object.entries(genBlock.derivedProps)) {
          derivedValues[propName] = evaluateDerivedProp(propDef, combo);
        }
      }

      const allValues = { ...combo, ...derivedValues };
      const { id, unresolvedPlaceholders } = substitutePattern(genBlock.idPattern, allValues);

      if (unresolvedPlaceholders.length > 0) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_ID_PATTERN_UNRESOLVED_PLACEHOLDER,
          path: `${blockPath}.idPattern`,
          severity: 'error',
          message: `idPattern placeholder(s) {${unresolvedPlaceholders.join('}, {')}} match neither dimension nor derived prop.`,
        });
        continue;
      }

      // Build runtimeProps from dimensions + derivedProps
      const runtimeProps: Record<string, string | number> = {};
      for (const dim of genBlock.dimensions) {
        // combo is guaranteed to contain this key (built from these dimensions)
        runtimeProps[dim.name] = combo[dim.name] as string | number;
      }
      for (const [propName, propValue] of Object.entries(derivedValues)) {
        runtimeProps[propName] = propValue;
      }

      expandedPieceTypes.push({
        id,
        seat: genBlock.seat,
        statusDimensions: genBlock.statusDimensions,
        transitions: genBlock.transitions,
        runtimeProps,
      });

      expandedInventory.push({
        pieceTypeId: id,
        seat: genBlock.seat,
        total: genBlock.inventoryPerCombination,
      });
    }
  }

  // Check for duplicate IDs across all pieceTypes
  const seenIds = new Set<string>();
  for (const [idx, pt] of expandedPieceTypes.entries()) {
    if (!isRecord(pt) || typeof pt.id !== 'string') continue;
    if (seenIds.has(pt.id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DUPLICATE_ID,
        path: `${assetPath}.pieceTypes[${idx}]`,
        severity: 'error',
        message: `Duplicate piece type id "${pt.id}" after generation expansion.`,
      });
    }
    seenIds.add(pt.id);
  }

  return {
    pieceTypes: expandedPieceTypes,
    inventory: expandedInventory,
  };
}

// ---------------------------------------------------------------------------
// Main expansion pass
// ---------------------------------------------------------------------------

export function expandPieceGeneration(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (doc.dataAssets === null || doc.dataAssets.length === 0) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  let changed = false;

  const rewrittenAssets: GameSpecDataAsset[] = doc.dataAssets.map((asset, assetIdx) => {
    if (asset.kind !== 'pieceCatalog') {
      return asset;
    }

    if (!isPieceCatalogPayload(asset.payload)) {
      return asset;
    }

    // Check if any pieceType has a generate block
    const hasGenerate = asset.payload.pieceTypes.some(isGenerateEntry);
    if (!hasGenerate) {
      return asset;
    }

    changed = true;
    const assetPath = `dataAssets[${assetIdx}].payload`;
    const expandedPayload = expandPieceCatalogAsset(asset.payload, assetPath, diagnostics);

    return {
      ...asset,
      payload: expandedPayload,
    };
  });

  if (!changed) {
    return { doc, diagnostics };
  }

  return {
    doc: { ...doc, dataAssets: rewrittenAssets },
    diagnostics,
  };
}
