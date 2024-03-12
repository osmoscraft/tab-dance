import { closeOthers, handleTabCreated, handleTabRemoved, moveTabs, openTab, printDebugInfo } from "../lib/tab-actions";

chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);

async function handleCommand(command: string) {
  console.log(`Command: ${command}`);
  switch (command) {
    case "print-debug-info": {
      printDebugInfo();
      break;
    }
    case "toggle-extension":
    case "close-item":
    case "toggle-grouping": {
      console.log("Not implemented: Toggle extension");
      break;
    }
    case "close-others": {
      closeOthers();
      break;
    }
    case "open-previous": {
      openTab(-1);
      break;
    }
    case "open-next": {
      openTab(1);
      break;
    }
    case "move-previous": {
      moveTabs(-1);
      break;
    }
    case "move-next": {
      moveTabs(1);
      break;
    }
  }
}

chrome.tabs.onCreated.addListener(async (tab) => {
  console.log("created", {
    id: tab.id,
    title: tab.title,
    url: [tab.pendingUrl, tab.url],
    status: tab.status,
    opener: tab.openerTabId,
  });
});

function handleActionClick() {
  chrome.runtime.openOptionsPage();
}

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}
