import { Subject, filter, tap } from "rxjs";

// ISSUE after tab moved, the lastAccessed timestamp was not updated
// TODO ctrl shift space to undo
// TODO on init, set timestamp to be the index
// TODO handle dragged in tab
// TODO handle PWA, ignore window by type?
// TODO timestamp lost when re-opening browser session
// TODO no timestamp for new tab page
// TODO deduplicate identical URLs?
// TODO tab.lastAccessed typing available in chrom 121+
// TOOD revive closed tabs from history/session api
// TODO remove entry from dict when tab is detached or removed
// TODO possible for dict to overflow?
// QUIRK tabs.highlight triggers onHighlighted event but does not produce lastAccessed timestamp
// ISSUE look back/ahead mutates history itself, may need to distinguish with gated onHighlighted observer
// IDEA ^IO navigates, ^Space removes child tree
// IDEA ^IO undo tab opening, not just hiding
// IDEA Ctrl-O closes last viewed tab, Ctrl-Shift-O navigate out without closing, Ctrl-I undo closing
// IDEA Ctrl-Shift-O navigates out but brings current tab back in time

const $command = new Subject<string>();

chrome.commands.onCommand.addListener((command) => $command.next(command));
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);

const $nextJump = $command.pipe(filter((command) => command === "next-jump"));

$nextJump
  .pipe(
    tap(async () => {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const highlightedTab = allTabs.find((tab) => tab.highlighted);
      const nextChild = allTabs.find((tab) => tab.openerTabId === (highlightedTab?.id ?? null));
      if (nextChild) {
        chrome.tabs.highlight({ tabs: nextChild.index });
        return;
      }

      const parent = allTabs.find((tab) => tab.id === (highlightedTab?.openerTabId ?? null));
      if (parent) {
        const sibling = allTabs.find((tab) => tab.openerTabId === (parent.id ?? null));
        if (sibling) {
          chrome.tabs.highlight({ tabs: sibling.index });
          chrome.tabs.remove(highlightedTab!.id!);
          return;
        }

        chrome.tabs.highlight({ tabs: parent.index });
        chrome.tabs.remove(highlightedTab!.id!);
        return;
      }

      if (allTabs.length > 1) {
        chrome.tabs.remove(highlightedTab!.id!);
        return;
      }

      const currentNewTabHost = await lift(() => new URL(highlightedTab?.pendingUrl ?? highlightedTab?.url ?? ""))
        .then((parsed) => parsed.host)
        .catch(() => "");

      if (currentNewTabHost !== "newtab") {
        await chrome.tabs.create({});
        chrome.tabs.remove(highlightedTab!.id!);
      }
    }),
  )
  .subscribe();

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

async function lift<T>(factory: () => T) {
  return factory();
}
