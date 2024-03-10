import { closeOtherTabs, highlight, toggleGrouping } from "../lib/tab-actions";

chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

async function handleCommand(command: string) {
  switch (command) {
    case "toggle-extension": {
      console.log("Not implemented: Toggle extension");
      break;
    }
    case "toggle-grouping": {
      toggleGrouping();
      break;
    }
    case "new-item": {
      console.log("Not implemented: New item");
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

function handleActionClick() {
  chrome.runtime.openOptionsPage();
}

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}
