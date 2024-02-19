import type { ExtensionMessageRequest, ExtensionMessageResponse } from "../typings/message";

console.log("hello background page");

chrome.runtime.onMessage.addListener(handleExtensionMessage);

async function handleExtensionMessage(
  message: ExtensionMessageRequest,
  _sender: chrome.runtime.MessageSender,
  _sendResponse: (...args: any) => any,
) {
  if (message.ping) {
    chrome.runtime.sendMessage({ pong: true } satisfies ExtensionMessageResponse);
  }
}
