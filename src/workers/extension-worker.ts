chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

// TODO audio feedback for open in new tab
// TODO audio feedback for tab closure
// TODO audio feedback for dive-in
// TODO audio feedback for dive-out
// TODO options page to allow audio feedback

async function handleCommand(command: string) {
  if (command !== "next-tab") return;

  const allTabs = await chrome.tabs.query({ currentWindow: true });

  // const tree = new HistoryTree(allTabs);
  // await tree.closeVisitedTree();

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
}

function handleActionClick() {
  chrome.runtime.openOptionsPage();
}

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}

async function lift<T>(factory: () => T) {
  return factory();
}
