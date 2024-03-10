import { closeOtherTabs, handleNewTab, highlight, newItem, printDebugInfo, toggleGrouping } from "../lib/tab-actions";
import { removeGraphEntry } from "../lib/tab-graph";

chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

chrome.tabs.onCreated.addListener(handleNewTab);

chrome.tabs.onRemoved.addListener(async (e) => {
  await removeGraphEntry(e);
});

async function handleCommand(command: string) {
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
    case "new-item": {
      newItem();
      break;
    }
    case "new-tab": {
      console.log("Not implemented: New tab");
      break;
    }
    case "close-item": {
      console.log("Not implemented: Close item");
      break;
    }
    case "close-tab": {
      console.log("Not implemented: Close tab");
      break;
    }
    case "close-others": {
      console.log("Not implemented: Close other items");
      break;
    }
    case "previous-item": {
      console.log("Not implemented: Previous item");
      break;
    }
    case "next-item": {
      console.log("Not implemented: Next item");
      break;
    }

    case "highlight-previous": {
      highlight(-1);
      break;
    }
    case "highlight-next": {
      highlight(1);
      break;
    }
    case "close-other-tabs": {
      closeOtherTabs();
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
