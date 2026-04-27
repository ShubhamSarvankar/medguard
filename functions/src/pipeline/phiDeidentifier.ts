import type { PhiPlaceholder } from "@medguard/types";
import {
  ENTITY_TYPE_TO_PLACEHOLDER,
  ENTITY_TYPE_PROCESSING_ORDER,
  type ExtractedEntity,
} from "./phiEntityTypes";
import { extractPhiEntities } from "./phiExtractClient";

export interface DeidentifyResult {
  text: string;
  replacementCount: number;
  skippedByType: Record<string, number>;
}

interface GroupedEntities {
  [type: string]: ExtractedEntity[];
}

function typeSortKey(type: string): number {
  const idx = ENTITY_TYPE_PROCESSING_ORDER.indexOf(type);
  // Unknown types fall after the last known type
  return idx === -1 ? ENTITY_TYPE_PROCESSING_ORDER.length : idx;
}

function makePlaceholder(type: string): string {
  const known = ENTITY_TYPE_TO_PLACEHOLDER[type];
  if (known) return known;
  // Unknown types produce a generic bracket tag so no PHI leaks as plain text
  return `[${type.toUpperCase()}]` as PhiPlaceholder;
}

// Word boundaries apply only when value starts/ends with \w; non-word-bounded values (e.g. "(555) 123-4567") use a plain literal match.
function makeWordBoundaryPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithWord = /^\w/.test(value);
  const endsWithWord = /\w$/.test(value);
  const prefix = startsWithWord ? "\\b" : "";
  const suffix = endsWithWord ? "\\b" : "";
  return new RegExp(`${prefix}${escaped}${suffix}`, "g");
}

function redactEntities(
  text: string,
  entities: ExtractedEntity[]
): DeidentifyResult {
  if (!entities.length || !text) {
    return { text, replacementCount: 0, skippedByType: {} };
  }

  const groups: GroupedEntities = {};
  for (const entity of entities) {
    if (!entity.type || !entity.value) continue;
    (groups[entity.type] ??= []).push(entity);
  }

  // Sort longest value first within each group to prevent partial matches consuming shorter ones.
  for (const type of Object.keys(groups)) {
    groups[type]!.sort((a, b) => b.value.length - a.value.length);
  }

  let result = text;
  let totalReplacements = 0;
  const skippedByType: Record<string, number> = {};
  const processedValues = new Set<string>();

  const sortedTypes = Object.keys(groups).sort(
    (a, b) => typeSortKey(a) - typeSortKey(b)
  );

  for (const type of sortedTypes) {
    const typeEntities = groups[type]!;
    const placeholder = makePlaceholder(type);
    let successfulInGroup = 0;
    let skippedInGroup = 0;

    for (const entity of typeEntities) {
      const { value } = entity;
      if (processedValues.has(value)) continue;
      processedValues.add(value);

      const pattern = makeWordBoundaryPattern(value);
      const occurrences = (result.match(pattern) ?? []).length;

      if (occurrences === 0) {
        skippedInGroup++;
        continue;
      }

      result = result.replace(pattern, placeholder);
      totalReplacements += occurrences;
      successfulInGroup++;
    }

    // Only warn when every entity in the group is absent; partial skips (e.g. a full name already consumed a first name) are expected.
    if (successfulInGroup === 0 && skippedInGroup > 0) {
      skippedByType[type] = skippedInGroup;
    }
  }

  return { text: result, replacementCount: totalReplacements, skippedByType };
}

export async function deidentifyText(input: string): Promise<DeidentifyResult> {
  if (!input || input.trim().length === 0) {
    return { text: input, replacementCount: 0, skippedByType: {} };
  }

  const entities = await extractPhiEntities(input);
  return redactEntities(input, entities);
}

export async function deidentifyFields(
  fields: Record<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    Object.entries(fields).map(async ([key, value]) => {
      result[key] = (await deidentifyText(value)).text;
    })
  );
  return result;
}

// Exported for testing the redaction stage in isolation without an LLM call
export { redactEntities };