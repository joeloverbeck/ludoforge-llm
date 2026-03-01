import type { Diagnostic } from '../kernel/diagnostics.js';
import type { SeatCatalogPayload } from '../kernel/types-core.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type {
  GameSpecDoc,
  GameSpecZoneDef,
  GameSpecZoneTemplateDef,
} from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isTemplateEntry(
  entry: GameSpecZoneDef | GameSpecZoneTemplateDef,
): entry is GameSpecZoneTemplateDef {
  return 'template' in entry;
}

// ---------------------------------------------------------------------------
// Seat catalog resolution
// ---------------------------------------------------------------------------

function extractSeatIdsFromDataAssets(
  dataAssets: readonly { readonly kind: string; readonly payload: unknown }[] | null,
): readonly string[] | undefined {
  if (dataAssets === null) {
    return undefined;
  }

  for (const asset of dataAssets) {
    if (asset.kind !== 'seatCatalog') {
      continue;
    }
    const payload = asset.payload as SeatCatalogPayload | undefined;
    if (
      payload !== undefined &&
      payload !== null &&
      Array.isArray(payload.seats)
    ) {
      return payload.seats.map((seat) => seat.id);
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Main expansion pass
// ---------------------------------------------------------------------------

export function expandZoneTemplates(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (doc.zones === null || doc.zones.length === 0) {
    return { doc, diagnostics: [] };
  }

  const hasTemplates = doc.zones.some(isTemplateEntry);
  if (!hasTemplates) {
    return { doc, diagnostics: [] };
  }

  const seatIds = extractSeatIdsFromDataAssets(doc.dataAssets);

  const diagnostics: Diagnostic[] = [];
  const expanded: GameSpecZoneDef[] = [];

  for (const [entryIdx, entry] of doc.zones.entries()) {
    if (!isTemplateEntry(entry)) {
      expanded.push(entry);
      continue;
    }

    const tmpl = entry.template;
    const path = `zones[${entryIdx}].template`;

    // Validate: seatCatalog must exist when templates are used
    if (seatIds === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_SEAT_CATALOG_MISSING,
        path,
        severity: 'error',
        message:
          'Zone template requires a seatCatalog data asset but none was found.',
      });
      continue;
    }

    // Validate: idPattern must contain {seat}
    if (!tmpl.idPattern.includes('{seat}')) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_ID_PATTERN_MISSING_SEAT,
        path: `${path}.idPattern`,
        severity: 'error',
        message: `idPattern "${tmpl.idPattern}" does not contain {seat} placeholder.`,
      });
      continue;
    }

    // Expand: one zone per seat
    for (const seatId of seatIds) {
      const zoneDef: GameSpecZoneDef = {
        id: tmpl.idPattern.replace(/\{seat\}/g, seatId),
        owner: tmpl.owner,
        visibility: tmpl.visibility,
        ordering: tmpl.ordering,
        ...(tmpl.zoneKind !== undefined ? { zoneKind: tmpl.zoneKind } : {}),
        ...(tmpl.isInternal !== undefined
          ? { isInternal: tmpl.isInternal }
          : {}),
        ...(tmpl.category !== undefined ? { category: tmpl.category } : {}),
        ...(tmpl.attributes !== undefined
          ? { attributes: tmpl.attributes }
          : {}),
      };
      expanded.push(zoneDef);
    }
  }

  // Check for duplicate IDs across all entries
  const seenIds = new Set<string>();
  for (const [idx, zone] of expanded.entries()) {
    if (seenIds.has(zone.id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_DUPLICATE_ID,
        path: `zones[${idx}]`,
        severity: 'error',
        message: `Duplicate zone id "${zone.id}" after template expansion.`,
      });
    }
    seenIds.add(zone.id);
  }

  return {
    doc: { ...doc, zones: expanded },
    diagnostics,
  };
}
