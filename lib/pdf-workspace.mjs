export function appendPdfDraftsToWorkspace(state, drafts) {
  return {
    ...state,
    drafts: [...(state.drafts || []), ...drafts],
  };
}

export async function appendPdfDraftsAfterUpload({
  upload,
  getLatestWorkspace,
  drafts,
}) {
  await upload();
  return appendPdfDraftsToWorkspace(getLatestWorkspace(), drafts);
}
