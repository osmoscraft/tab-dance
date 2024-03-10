export async function closeTabBackward() {
  const currentId = (await getTabs()).find((tab) => tab.highlighted)?.id;
  await highlight(-1);
  if (currentId !== undefined) {
    await chrome.tabs.remove(currentId);
  }
}

export async function closeVisitedTree() {
  const tabs = await getTabs();
  const visited = getReachable(tabs).filter((tab) => tab.lastAccessed !== undefined);
  await chrome.tabs.remove(visited.map((tab) => tab.id!));
}

export async function closeOtherTabs() {
  const tabs = await getTabs();
  const otherIds = tabs
    .filter((tab) => !tab.highlighted)
    .map((tab) => tab.id)
    .filter(isDefined);
  await chrome.tabs.remove(otherIds);
}

export async function closeOtherTrees() {
  const tabs = await getTabs();
  const root = getTreeRoot(tabs);
  const reachableFromRoot = getReachable(tabs, root?.index);
  const unreadableIds = tabs
    .map((tab) => tab.id)
    .filter(isDefined)
    .filter((id) => !reachableFromRoot.some((tab) => tab.id === id));

  await chrome.tabs.remove(unreadableIds);
}

export async function highlight(offset: number) {
  const tabs = await getTabs();
  const highlightedIndex = tabs.find((tab) => tab.highlighted)?.index ?? 0;
  const targetIndex = (tabs.length + highlightedIndex + offset) % tabs.length;
  console.log({ targetIndex });
  await chrome.tabs.highlight({ tabs: targetIndex });
}

export interface TabTreeItem {
  index: number;
  id?: number;
  highlighted?: boolean;
  openerTabId?: number;
}

function getTreeRoot<T extends TabTreeItem>(tabs: T[], startIndex?: number) {
  let rootIndex = startIndex === undefined ? tabs.find((tab) => tab.highlighted)?.index : startIndex;

  if (rootIndex === undefined) {
    return;
  }

  let current = tabs.at(rootIndex);
  while (current?.openerTabId !== undefined) {
    current = tabs.find((tab) => tab.id === current?.openerTabId);
  }

  return current;
}

function getReachable<T extends TabTreeItem>(tabs: T[], rootIndex?: number) {
  const chosenRootIndex = rootIndex === undefined ? tabs.find((tab) => tab.highlighted)?.index : rootIndex;

  const queue: number[] = chosenRootIndex !== undefined ? [chosenRootIndex] : [];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);
    const children = tabs
      .filter((tab) => tab.openerTabId !== undefined && tab.openerTabId === tabs.at(current)!.id)
      .map((tab) => tab.index);

    queue.push(...children);
  }

  return [...visited].map((index) => tabs.at(index)!);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function getTabs() {
  return chrome.tabs.query({ currentWindow: true });
}
