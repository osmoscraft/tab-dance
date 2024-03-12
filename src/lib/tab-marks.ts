export async function getMarks(): Promise<Set<number>> {
  const marks = (await chrome.storage.session.get("tabMarks")).tabMarks;
  return new Set(marks ?? []);
}

export async function addMarks(ids: number[]) {
  const marks = (await chrome.storage.session.get("tabMarks")).tabMarks ?? [];
  const updatedMarks = [...new Set([...marks, ...ids])];
  await chrome.storage.session.set({ tabMarks: updatedMarks });
}

export async function removeMarks(removedIds: number[]) {
  const marks: number[] = (await chrome.storage.session.get("tabMarks")).tabMarks ?? [];
  const updatedMarks = marks.filter((selfId) => !removedIds.includes(selfId));

  await chrome.storage.session.set({ tabMarks: updatedMarks });
}

export async function clearMarks() {
  await chrome.storage.session.set({ tabMarks: [] });
}
