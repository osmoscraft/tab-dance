export interface HistorySourceTab {
  index: number;
  id?: number;
  highlighted?: boolean;
  openerTabId?: number;
  lastAccessed?: number;
}

export class HistoryTree {
  constructor(private tabs: HistorySourceTab[] = []) {}

  public async closeVisitedTree() {
    const visited = this.getReachable().filter((tab) => tab.lastAccessed !== undefined);
    await chrome.tabs.remove(visited.map((tab) => tab.id!));
  }

  private getReachable() {
    const highlightedIndex = this.tabs.find((tab) => tab.highlighted)?.index;

    const queue: number[] = highlightedIndex !== undefined ? [highlightedIndex] : [];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      visited.add(current);
      const children = this.tabs
        .filter((tab) => tab.openerTabId !== undefined && tab.openerTabId === this.tabs.at(current)!.id)
        .map((tab) => tab.index);

      queue.push(...children);
    }

    return [...visited].map((index) => this.tabs.at(index)!);
  }
}
