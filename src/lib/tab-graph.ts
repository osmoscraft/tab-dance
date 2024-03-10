// TODO
// caching results until appended
// do not write if there is no change
// auto remove unreachable tab?

/**
 * Map: selfId -> openerId
 */
export async function getGraph(): Promise<Map<number, number>> {
  const graph = (await chrome.storage.session.get("tabOpenerGraph")).tabOpenerGraph;
  return new Map(graph ?? []);
}

export async function appendGraphEntry(entry: [selfId: number, openerId: number]) {
  const graph = (await chrome.storage.session.get("tabOpenerGraph")).tabOpenerGraph ?? [];
  const updatedGraph = [...graph, entry];

  await chrome.storage.session.set({ tabOpenerGraph: updatedGraph });
}

export async function removeGraphEntry(removedId: number) {
  const graph: [number, number][] = (await chrome.storage.session.get("tabOpenerGraph")).tabOpenerGraph ?? [];
  const updatedGraph = graph.filter(([selfId, targetId]) => selfId !== removedId && targetId !== removedId);

  await chrome.storage.session.set({ tabOpenerGraph: updatedGraph });
}
