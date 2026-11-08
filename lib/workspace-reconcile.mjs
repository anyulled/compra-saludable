const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Preserve edits made after a snapshot was submitted while adding its committed drafts. */
export function reconcileWorkspaceWrite(base, latest, committed) {
  const result = { ...committed };
  for (const key of new Set([
    ...Object.keys(base || {}),
    ...Object.keys(latest || {}),
    ...Object.keys(committed || {}),
  ])) {
    if (key === "drafts") continue;
    if (!sameValue(latest?.[key], base?.[key])) result[key] = latest[key];
  }

  const baseDraftIds = new Set((base?.drafts || []).map((draft) => draft.id));
  const latestDrafts = latest?.drafts || [];
  const latestDraftIds = new Set(latestDrafts.map((draft) => draft.id));
  const committedAdditions = (committed?.drafts || []).filter(
    (draft) => !baseDraftIds.has(draft.id) && !latestDraftIds.has(draft.id),
  );
  result.drafts = [...latestDrafts, ...committedAdditions];
  return result;
}
