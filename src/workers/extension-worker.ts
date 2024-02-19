import { setupOffscreenDocument } from "../lib/offscreen";
import { backgroundPageParameters } from "../lib/parameters";
import type { ExtensionMessageRequest } from "../typings/message";

console.log("hello extension worker");

chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onMessage.addListener(handleExtensionMessage);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);
(globalThis.self as any as ServiceWorkerGlobalScope).addEventListener("fetch", handleFetchEvent);

chrome.tabs.onCreated.addListener((tab) => {
  // TBD
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return; // if user is dragging
  console.log(`[worker] tab updated [${tabId}]: ${changeInfo.status} ${tab.url}`);
  if (!tab.url) return; // TBD: do we need to remove tabs e.g. when current tab is replaced by blank url?

  const identicalTab = await findIdenticalTab(tab);
  if (identicalTab) {
    console.log(`[worker] found identical tab [${identicalTab.id}]: ${identicalTab.url}`);
    await chrome.tabs.remove(tabId);
    await chrome.tabs.highlight({ tabs: identicalTab.index });
    return;
  }

  const pageKey = await getPageKey(tab.url);
  console.log(tab.url, pageKey);

  const [identitySharingTabs, groupSharingTabs] = await Promise.all([
    findTabsByGroupIdentity(pageKey),
    getTabsByGroupId(tab.groupId),
  ]);

  const uniqueHostKeys = await Promise.all(groupSharingTabs.map((tab) => tab.url ?? "").map((url) => getPageKey(url)));
  const uniqueHostsInGroup = new Set(uniqueHostKeys);
  const invalidGroupIds = new Set<number>([chrome.tabGroups.TAB_GROUP_ID_NONE]);
  if (uniqueHostsInGroup.size > 1) invalidGroupIds.add(tab.groupId);

  // if the same host is split across multiple groups, avoid adding to the current group
  const uniqueGroups = new Set(identitySharingTabs.filter(isGroupedTab).map((tab) => tab.groupId));
  if (uniqueGroups.size > 1) invalidGroupIds.add(tab.groupId);

  const newGroupId = identitySharingTabs.findLast((tab) => !invalidGroupIds.has(tab.groupId))?.groupId;
  const groupId = await chrome.tabs.group({ tabIds: tabId, groupId: newGroupId });

  chrome.tabGroups.update(groupId, { title: getGroupTitle(identitySharingTabs) });
});

// if the tab url is the same as existing tab, close current tab and navigate to existing tab
async function findIdenticalTab(tab: chrome.tabs.Tab) {
  const sameTabsByUrl = await chrome.tabs.query({ currentWindow: true, url: tab.url });

  return sameTabsByUrl.find((t) => t.id !== tab.id);
}

// in the current window, find all tabs with the same host
async function findTabsByGroupIdentity(key: string) {
  const tabHandles = await chrome.tabs
    .query({
      currentWindow: true,
    })
    .then(async (tabs) => {
      const validTabs = tabs.filter(hasId).filter((tab) => !!tab.url);
      const validTabHandles = await Promise.all(
        validTabs.map(async (tab) => ({
          key: await getPageKey(tab.url!),
          tab,
        })),
      );

      return validTabHandles.filter((handle) => handle.key === key);
    });

  return tabHandles.map((tab) => tab.tab);
}

async function getTabsByGroupId(groupId: number) {
  if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return [];

  const tabs = await chrome.tabs.query({ currentWindow: true, groupId });
  return tabs.filter(hasId);
}

function getFaviconUrl(pageUrl: string) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "16");
  return url.toString();
}

async function getFaviconHash(faviconUrl: string) {
  return fetch(faviconUrl)
    .then((response) => response.arrayBuffer())
    .then((data) => crypto.subtle.digest("SHA-1", data))
    .then((hash) => {
      const hashArray = Array.from(new Uint8Array(hash));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return hashHex;
    });
}

const faviconHashMap = new Map<string, Promise<string>>();
async function getPageKey(url: string) {
  const cacheKey = getCacheKey(url);
  let existing = faviconHashMap.get(cacheKey);
  if (!existing) {
    existing = getPageKeyNew(url);
    faviconHashMap.set(cacheKey, existing);
  }

  return existing;
}

async function getPageKeyNew(url: string) {
  return `${await getSiteURLIdentity(url)}:${await getSiteVisualIdentity(url)}`;
}

function getCacheKey(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getSiteURLIdentity(pageUrl: string) {
  return new Promise<URL>((resolve) => resolve(new URL(pageUrl)))
    .then((validURL) => validURL.host.split(".").slice(-2).join("."))
    .catch(() => pageUrl);
}

async function getSiteVisualIdentity(pageUrl: string) {
  return new Promise<URL>((resolve) => resolve(new URL(pageUrl)))
    .then((validURL) => getFaviconUrl(validURL.href))
    .then((faviconUrl) => getFaviconHash(faviconUrl))
    .catch(() => new URL(pageUrl).host)
    .catch(() => pageUrl);
}

function getGroupTitle(tabs: chrome.tabs.Tab[]) {
  // return shortest common url segments right-to-left
  // e.g. [www.github.com, github.com] -> github.com
  // e.g. [www.github.com, www.github.com] -> www.github.com
  // e.g. [www.github.com, docs.github.com] -> github.com

  const urls = tabs.filter((tab) => !!tab.url);
  if (urls.length === 0) return "New Group";

  const hosts = urls.map((tab) => new URL(tab.url!).host);
  const segments = hosts.map((host) => host.split(".").reverse());

  const shortestLength = Math.min(...segments.map((segment) => segment.length));

  const commonSegments = [];
  for (let i = 0; i < shortestLength; i++) {
    const segment = segments[0][i];
    if (segments.every((s) => s[i] === segment)) {
      commonSegments.push(segment);
    } else {
      break;
    }
  }

  if (commonSegments.length === 0) return "New Group";

  return commonSegments.reverse().join(".");
}

function isGroupedTab(tab: chrome.tabs.Tab) {
  return tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
}

function hasId(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  return tab.id !== undefined;
}

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
