/** Owner/permission metadata that API listings attach to resources. */
export interface ResourceOwnership {
  isOwner?: boolean;
  ownerEmail?: string;
}

/**
 * Resolve a resource's creator/owner email. Listings only carry `ownerEmail`
 * for resources the current user does not own, so fall back to the current
 * user's email for owned (or untagged) items. A resource explicitly tagged
 * `isOwner: false` without an `ownerEmail` is treated as unknown rather than
 * attributed to the current user.
 */
export function resolveOwnerEmail(
  resource: ResourceOwnership,
  currentUserEmail?: string
): string | undefined {
  if (resource.ownerEmail) return resource.ownerEmail;
  if (resource.isOwner === false) return undefined;
  return currentUserEmail;
}
