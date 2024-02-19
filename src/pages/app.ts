import type { ExtensionMessageRequest } from "../typings/message";
import "./app.css";

// To ensure the latest feed cache is rendered, we handle two possible scenarios:
// 1. Background is not fetching -> cache must be up-to-date -> fetchCacheNewerThan will return latest
// 2. Background is fetching -> channels event will eventually fire -> channels event will trigger a reload

chrome.runtime.sendMessage({ ping: true } satisfies ExtensionMessageRequest);
chrome.runtime.onMessage.addListener(handleExtensionMessage);

function handleExtensionMessage(e: ExtensionMessageRequest) {
  console.log("Received message", e);
}
