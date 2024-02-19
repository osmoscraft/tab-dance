import { setupOffscreenDocument } from "../lib/offscreen";
import { backgroundPageParameters } from "../lib/parameters";
import type { ExtensionMessageRequest } from "../typings/message";

chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onMessage.addListener(handleExtensionMessage);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);
(globalThis.self as any as ServiceWorkerGlobalScope).addEventListener("fetch", handleFetchEvent);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log(`[worker] tab updated [${tabId}]: ${changeInfo.status} [${tab.url}`)
})

function handleActionClick() {
  const readerPageUrl = new URL(chrome.runtime.getURL("app.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
  console.log("Action clicked");
}

async function handleExtensionMessage(message: ExtensionMessageRequest) {
  console.log("[worker] received message", message);
}

async function handleExtensionInstall() {
  await setupOffscreenDocument(backgroundPageParameters);
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}

async function handleBrowserStart() {
  await setupOffscreenDocument(backgroundPageParameters);
}

function handleFetchEvent(event: FetchEvent) {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname === "/app.html") {
    const responseAsync = new Promise<Response>(async (resolve) => {
      const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <link rel="icon" type="image/svg+xml" href="./images/icon.svg" />
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <h1>Service Worker rendered page</h1>
    <script type="module" src="./app.js"></script>
  </body>
</html>`;

      resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });

    event.respondWith(responseAsync);
  }
}
