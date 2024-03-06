export interface TabTreeItem {
  index: number;
  id?: number;
  highlighted?: boolean;
  openerTabId?: number;
  lastAccessed?: number;
}

export class TabTree {
  private tabsAsync: Promise<TabTreeItem[]>;

  constructor() {
    this.tabsAsync = chrome.tabs.query({ currentWindow: true });
    this.tabsAsync.then(console.log);
  }

  public async closeVisitedTree() {
    const tabs = await this.tabsAsync;
    const visited = this.getReachable(tabs).filter((tab) => tab.lastAccessed !== undefined);
    await chrome.tabs.remove(visited.map((tab) => tab.id!));
  }

  public async closeOtherTabs() {
    const tabs = await this.tabsAsync;
    const otherIds = tabs
      .filter((tab) => !tab.highlighted)
      .map((tab) => tab.id)
      .filter(this.isDefined);
    await chrome.tabs.remove(otherIds);
  }

  public async highlight(offset: number) {
    const tabs = await this.tabsAsync;
    const highlightedIndex = tabs.find((tab) => tab.highlighted)?.index ?? 0;
    const targetIndex = (tabs.length + highlightedIndex + offset) % tabs.length;
    console.log({ targetIndex });
    await chrome.tabs.highlight({ tabs: targetIndex });
  }

  private getReachable(tabs: TabTreeItem[]) {
    const highlightedIndex = tabs.find((tab) => tab.highlighted)?.index;

    const queue: number[] = highlightedIndex !== undefined ? [highlightedIndex] : [];
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

  private isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
  }
}
