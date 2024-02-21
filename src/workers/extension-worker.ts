import { Subject, filter, mergeMap, tap } from "rxjs";

// ISSUE after tab moved, the lastAccessed timestamp was not updated
// TODO on init, set timestamp to be the index
// TODO handle dragged in tab
// TODO handle PWA, ignore window by type?
// TODO timestamp lost when re-opening browser session
// TODO no timestamp for new tab page
// TODO deduplicate identical URLs?
// TODO tab.lastAccessed typing available in chrom 121+
// QUIRK tabs.highlight triggers onHighlighted event but does not produce lastAccessed timestamp

const $tabHighlighted = new Subject<chrome.tabs.TabHighlightInfo>();
const $tabUpdated = new Subject<{ tabId: number; changeInfo: chrome.tabs.TabChangeInfo; tab: chrome.tabs.Tab }>();
const $tabCreated = new Subject<chrome.tabs.Tab>();
const $command = new Subject<string>();
const $tabGroupUpdated = new Subject<chrome.tabGroups.TabGroup>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => $tabUpdated.next({ tabId, changeInfo, tab }));
chrome.tabs.onCreated.addListener((tab) => $tabCreated.next(tab));
chrome.commands.onCommand.addListener((command) => $command.next(command));
chrome.tabGroups.onUpdated.addListener((tabGroup) => $tabGroupUpdated.next(tabGroup));
chrome.tabGroups.onMoved.addListener((tabGroup) => $tabGroupUpdated.next(tabGroup));
chrome.tabs.onHighlighted.addListener((highlightInfo) => $tabHighlighted.next(highlightInfo));
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);

const $openPrevious = $command.pipe(filter((command) => command === "open-previous"));
const $openNext = $command.pipe(filter((command) => command === "open-next"));
const $printDebug = $command.pipe(filter((command) => command === "print-debug"));
const $organizeTabs = $command.pipe(filter((command) => command === "organize-tabs"));

$tabHighlighted
  .pipe(
    tap(async (highlightInfo) => {
      console.log(`highlighed`, highlightInfo.tabIds);
    }),
    mergeMap(async (info) => {
      const highlightEntries = await Promise.all(info.tabIds.map((tabId) => chrome.tabs.get(tabId)));
      console.log(`highlighed entries`, highlightEntries);
      const highlightDict = Object.fromEntries(highlightEntries.map((tab) => [tab.id!.toString(), Date.now()]));
      console.log(highlightDict);
      chrome.storage.session.set(highlightDict);
    }),
  )
  .subscribe();

$printDebug
  .pipe(
    tap(async () => {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const accessTimeDict = (await chrome.storage.session.get(allTabs.map((tab) => tab.id!.toString()))) as Record<
        string,
        number
      >;

      const allTabsWithTime = allTabs
        .map((tab) => ({ ...tab, lastAccessed: accessTimeDict[tab.id!.toString()] ?? Infinity }))
        .sort((a, b) => (a as any).lastAccessed - (b as any).lastAccessed)
        .map((t) => `${t.lastAccessed} ${t.index} ${t.title}`)
        .join("\n");

      console.log(allTabsWithTime);
    }),
  )
  .subscribe();

$organizeTabs
  .pipe(
    mergeMap(async () => {
      // ensure chronological sorted
      const allTabs = await chrome.tabs.query({ currentWindow: true });

      const accessTimeDict = (await chrome.storage.session.get(allTabs.map((tab) => tab.id!.toString()))) as Record<
        string,
        number
      >;
      console.log({ accessTimeDict });

      const currentTab = await chrome.tabs
        .query({ currentWindow: true, highlighted: true })
        .then((tabs) => tabs.at(0)?.id);

      const sortedTabs = allTabs
        .filter(hasId)
        .map(ensureLastAccessTime.bind(null, accessTimeDict))
        .toSorted((a, b) => a.lastAccessed - b.lastAccessed)
        .map((tab, index) => ({ ...tab, targetIndex: index }));

      // Avoid moving current tab as it will trigger onHighlighted event
      // History manipulation must not affect history
      // TODO do not make unnecessary move
      for (const sortedTab of sortedTabs) {
        if (sortedTab.id === currentTab) continue;
        await chrome.tabs.move(sortedTab.id!, { index: sortedTab.targetIndex });
      }
    }),
  )
  .subscribe();

$openNext
  .pipe(
    mergeMap(async () => {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const currentHighlightedIndex = await chrome.tabs
        .query({ currentWindow: true, highlighted: true })
        .then((tabs) => tabs.at(0)?.index ?? allTabs.length - 1);
      if (currentHighlightedIndex === allTabs.length - 1) return;

      chrome.tabs.highlight({ tabs: currentHighlightedIndex + 1 });
    }),
  )
  .subscribe();

$openPrevious
  .pipe(
    mergeMap(async () => {
      const currentHighlightedIndex = await chrome.tabs
        .query({ currentWindow: true, highlighted: true })
        .then((tabs) => tabs.at(0)?.index ?? 0);
      if (!currentHighlightedIndex) return;

      chrome.tabs.highlight({ tabs: currentHighlightedIndex - 1 });
    }),
  )
  .subscribe();

function ensureLastAccessTime(
  dict: Record<string, number>,
  tab: chrome.tabs.Tab,
): chrome.tabs.Tab & { lastAccessed: number } {
  return { ...tab, lastAccessed: dict[tab.id!.toString()] ?? Infinity };
}

function hasId(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  return tab.id !== undefined;
}

function handleActionClick() {
  chrome.runtime.openOptionsPage();
}

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}

async function handleBrowserStart() {
  // TODO Start grouping on start
}
