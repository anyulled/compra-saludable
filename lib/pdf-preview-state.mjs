export function isCurrentPdfPreview(preview, documentId) {
  return Boolean(preview?.documentId === documentId && preview?.url);
}

export function isHouseholdPdfPath(path, householdId, documentId) {
  return Boolean(path && documentId && path === `${householdId}/${documentId}.pdf`);
}
