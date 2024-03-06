import { TabTree } from "../lib/tab-tree";

chrome.commands.onCommand.addListener(handleCommand);
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);

async function handleCommand(command: string) {
  switch (command) {
    case "highlight-previous": {
      const tree = new TabTree();
      tree.highlight(-1);
      break;
    }
    case "highlight-next": {
      const tree = new TabTree();
      tree.highlight(1);
      break;
    }
    case "close-other-tabs": {
      const tree = new TabTree();
      tree.closeOtherTabs();
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
