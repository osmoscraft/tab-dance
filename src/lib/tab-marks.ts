export async function getMarks(): Promise<Set<number>> {
  const marks = (await chrome.storage.session.get("tabMarks")).tabMarks;
  return new Set(marks ?? []);
}

export async function addMark(id: number) {
  const marks = (await chrome.storage.session.get("tabMarks")).tabMarks ?? [];
  const updatedMarks = [...new Set([...marks, id])];
  await chrome.storage.session.set({ tabMarks: updatedMarks });
}

export async function removeMark(removedId: number) {
  const marks: number[] = (await chrome.storage.session.get("tabMarks")).tabMarks ?? [];
  const updatedMarks = marks.filter((selfId) => selfId !== removedId);

  await chrome.storage.session.set({ tabMarks: updatedMarks });
}
