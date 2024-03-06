import { closeOtherTabs, closeTabBackward, highlight } from "../lib/tab-actions";

chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

async function handleCommand(command: string) {
  switch (command) {
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
    case "close-tab-backward": {
      closeTabBackward();
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
