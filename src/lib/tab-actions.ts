import { appendGraphEntry, getGraph, removeGraphEntry } from "./tab-graph";
import { addMarks, clearMarks, getMarks, removeMarks } from "./tab-marks";

export async function printDebugInfo() {
  const tabs = await getTabs();
  const graph = await getGraph();
  const marks = await getMarks();
  console.log({ tabs, graph, marks });
}

export async function toggleGrouping() {
  const tabs = withTabOpener(await getTabs(), await getGraph());
  const groupedTabs = tabs.filter((tab) => tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE);
  if (groupedTabs.length) {
    await chrome.tabs.ungroup(groupedTabs.map((tab) => tab.id).filter(isDefined));
  } else {
    await createTabTreeGroups(tabs);
  }
}

export async function handleTabCreated<T extends TabTreeItem>(tab: T) {
  if (tab.id && tab.openerTabId !== undefined) {
    // tracker opener except for newtab
    const isNewTab = await lift(() => new URL(tab.pendingUrl ?? tab.url ?? ""))
      .then((url) => url.hostname === "newtab")
      .catch(() => false);
    if (isNewTab) return;

    await appendGraphEntry([tab.id, tab.openerTabId]);
  }
}

export async function handleHighlighted() {
  const systemHighlightedIds = new Set((await getTabs()).filter((tab) => tab.highlighted).map((tab) => tab.id));
  const userHighlightIds = [...(await getMarks())];
  if (userHighlightIds.some((id) => !systemHighlightedIds.has(id))) {
    await clearMarks();
  }
}

export async function toggleSelect() {
  const tabs = await getTabs();
  const marks = await getMarks();
  const activeTab = tabs.find((tab) => tab.active);
  if (activeTab) {
    if (marks.has(activeTab.id!)) {
      await removeMarks([activeTab.id!]);
    } else {
      await addMarks([activeTab.id!]);
    }
  }
}

export async function cancelSelection() {
  const tabs = await getTabs();
  await clearSelectionInternal(tabs);
}

export async function closeOthers() {
  const tabs = await getTabs();

  // first discard tabs to allow undo
  const discarded = tabs.filter((tab) => tab.discarded);
  if (!discarded.length) {
    const otherIds = tabs
      .filter((tab) => !tab.highlighted)
      .map((tab) => tab.id)
      .filter(isDefined);

    await Promise.all(otherIds.map((id) => chrome.tabs.discard(id)));
    return;
  }

  // second, if already has discard, commit action
  await clearSelectionInternal(tabs);

  await chrome.tabs.remove(discarded.map((tab) => tab.id!));
}

async function clearSelectionInternal<T extends TabTreeItem>(tabs: T[]) {
  const nonActiveHighlighted = tabs.filter((tab) => !tab.active && tab.highlighted);
  if (nonActiveHighlighted.length) {
    const activeIndex = tabs.find((tab) => tab.active)!.index;
    await chrome.tabs.highlight({ tabs: [activeIndex] });
    await clearMarks();
  }
}

export async function moveTabs(offset: number) {
  const tabs = await getTabs();
  const highlightedTabs = [...tabs.filter((tab) => tab.highlighted)].sort((a, b) => a.index - b.index);
  if (!highlightedTabs.length) return;
  const [startIndex, endIndex] = [highlightedTabs.at(0)!.index, highlightedTabs.at(-1)!.index];

  const packedTabs = highlightedTabs.map((tab, packOffset) => ({
    ...tab,
    packIndex: offset < 0 ? startIndex + packOffset : endIndex - highlightedTabs.length + 1 + packOffset,
  }));

  let isPacking = false;
  await Promise.all(
    packedTabs.map((tab, index) => {
      if (tab.index !== tab.packIndex) {
        isPacking = true;
        return chrome.tabs.move(tab.id!, { index: tab.packIndex });
      }
    }),
  );

  if (isPacking) return;

  const [packStartIndex, packEndIndex] = [packedTabs.at(0)!.index, packedTabs.at(-1)!.index];
  if (offset < 0) {
    // move segment before the packed tabs to the end of the packed tabs
    await Promise.all(
      tabs
        .slice(packStartIndex + offset, packStartIndex)
        .map((tab) => chrome.tabs.move(tab.id!, { index: tab.index + packedTabs.length })),
    );
  } else {
    await Promise.all(
      tabs
        .slice(packEndIndex + 1, packEndIndex + 1 + offset)
        .map((tab) => chrome.tabs.move(tab.id!, { index: tab.index - packedTabs.length })),
    );
  }
}

export async function growTabs(offset: number) {
  const tabs = await getTabs();
  const highlightedTabs = [...tabs.filter((tab) => tab.highlighted)].sort((a, b) => a.index - b.index);
  if (!highlightedTabs.length) return;
  const [startIndex, endIndex] = [highlightedTabs.at(0)!.index, highlightedTabs.at(-1)!.index];

  if (offset < 0) {
    const highlightIndices = tabs.slice(startIndex + offset, endIndex + 1).map((tab) => tab.index);
    await chrome.tabs.highlight({ tabs: highlightIndices });
  } else {
    const highlightIndices = tabs
      .slice(startIndex, endIndex + 1 + offset)
      .map((tab) => tab.index)
      .reverse();
    await chrome.tabs.highlight({ tabs: highlightIndices });
  }
}

export async function handleTabRemoved<T extends TabTreeItem>(tabId: number) {
  await removeGraphEntry(tabId);
  await removeMarks([tabId]);
}

function withTabOpener<T extends TabTreeItem>(tabs: T[], graph: Map<number, number>): T[] {
  return tabs.map((t) => ({
    ...t,
    openerTabId: t.id ? graph.get(t.id) : undefined,
  }));
}

/**
 * Group all the tabs into trees using openerTabId as the parent-child relationship
 * Requirement: tabs must be ungrouped first
 */
async function createTabTreeGroups<T extends TabTreeItem>(tabs: T[], scopedIndices?: number[]) {
  const chosenTabs = scopedIndices ? scopedIndices.map((index) => tabs.at(index)).filter(isDefined) : tabs;
  const tabsLeftToRight = chosenTabs.sort((a, b) => a.index - b.index);
  const unvisitedTabIndices = new Set(tabsLeftToRight.map((tab) => tab.index));

  const createdGroupIdsAsync: Promise<number>[] = [];

  while (unvisitedTabIndices.size > 0) {
    const rootIndex = unvisitedTabIndices.values().next().value;
    const root = getTreeRoot(tabs, rootIndex);
    const reachable = getReachable(tabs, root?.index ?? rootIndex);

    createdGroupIdsAsync.push(chrome.tabs.group({ tabIds: reachable.map((tab) => tab.id).filter(isDefined) }));
    reachable.forEach((tab) => unvisitedTabIndices.delete(tab.index));
  }

  return await Promise.all(createdGroupIdsAsync);
}

export async function closeVisitedTree() {
  const tabs = await getTabs();
  const visited = getReachable(tabs).filter((tab) => tab.lastAccessed !== undefined);
  await chrome.tabs.remove(visited.map((tab) => tab.id!));
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

export async function openTab(offset: number) {
  const tabs = await getTabs();
  const activeIndex = tabs.find((tab) => tab.active)?.index ?? 0;
  const targetIndex = (tabs.length + activeIndex + offset) % tabs.length;
  const marks = await getMarks();
  const markIndices = [...marks]
    .map((mark) => tabs.findIndex((tab) => tab.id === mark))
    .filter((index) => index !== -1);
  await chrome.tabs.highlight({ tabs: [targetIndex, ...markIndices] });
}

export interface TabTreeItem {
  index: number;
  id?: number;
  active: boolean;
  highlighted?: boolean;
  openerTabId?: number;
  url?: string;
  pendingUrl?: string;
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

function lift<T>(thunk: () => T) {
  return new Promise<T>((resolve) => {
    resolve(thunk());
  });
}
