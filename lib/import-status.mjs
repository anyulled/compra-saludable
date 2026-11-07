/** Group new imports by ID. Legacy pages have only a filename and remain pending. */
export function documentKey(page) {
  return page.documentId || `legacy:${page.filename}`;
}
export function pageStatus(page) {
  return page.status || "pending";
}
export function summarizeImports(pages, approvedDocuments = {}) {
  const groups = new Map();
  for (const page of pages) {
    const id = documentKey(page);
    if (!groups.has(id))
      groups.set(id, {
        id,
        filename: page.filename,
        pages: [],
        pending: 0,
        reviewing: 0,
        reviewed: 0,
        discarded: 0,
      });
    const group = groups.get(id);
    group.pages.push(page);
    group[pageStatus(page)]++;
  }
  return [...groups.values()].map((group) => {
    const complete = group.pending === 0 && group.reviewing === 0;
    const approved = complete && approvedDocuments[group.id] === true;
    return {
      ...group,
      complete,
      status: approved
        ? "approved"
        : complete
          ? "ready"
          : group.reviewing || group.reviewed || group.discarded
            ? "reviewing"
            : "pending",
    };
  });
}
