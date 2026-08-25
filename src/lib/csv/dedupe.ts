import { normalizeIdentityText } from "./normalization";
import type { DedupeKeys, NormalizedLeadInput } from "./types";

export type DuplicateMatchKind = "placeId" | "phoneNormalized" | "nameAddress";

export function buildNameAddressKey(
  title: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const normalizedTitle = normalizeIdentityText(title);
  const normalizedAddress = normalizeIdentityText(address);
  if (!normalizedTitle || !normalizedAddress) return null;
  return `${normalizedTitle}::${normalizedAddress}`;
}

export function buildDedupeKeys(
  lead: Pick<
    NormalizedLeadInput,
    "placeId" | "phoneNormalized" | "title" | "address"
  > & { normalizedAddress?: string | null },
): DedupeKeys {
  return {
    placeId: lead.placeId?.trim() || null,
    phoneNormalized: lead.phoneNormalized?.trim() || null,
    nameAddress: buildNameAddressKey(
      lead.title,
      lead.normalizedAddress ?? lead.address,
    ),
  };
}

/** Returns the required priority when more than one identity key matches. */
export function identifyDuplicateMatch(
  incoming: DedupeKeys,
  existing: DedupeKeys,
): DuplicateMatchKind | null {
  if (incoming.placeId && incoming.placeId === existing.placeId) return "placeId";
  if (
    incoming.phoneNormalized &&
    incoming.phoneNormalized === existing.phoneNormalized
  ) {
    return "phoneNormalized";
  }
  if (incoming.nameAddress && incoming.nameAddress === existing.nameAddress) {
    return "nameAddress";
  }
  return null;
}
