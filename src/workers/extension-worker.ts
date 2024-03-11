import {
  closeOthers,
  handleTabCreated,
  handleTabRemoved,
  highlight,
  printDebugInfo,
  toggleGrouping,
} from "../lib/tab-actions";

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
    case "toggle-extension": {
      console.log("Not implemented: Toggle extension");
      break;
    }
    case "toggle-grouping": {
      toggleGrouping();
      break;
    }
    case "close-item": {
      console.log("Not implemented: Toggle extension");
      break;
    }
    case "close-others": {
      closeOthers();
      break;
    }
    case "previous-item": {
      highlight(-1);
      break;
    }
    case "next-item": {
      highlight(1);
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
