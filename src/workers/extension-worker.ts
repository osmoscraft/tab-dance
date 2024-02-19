import type { ExtensionMessageRequest } from "../typings/message";

chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onMessage.addListener(handleExtensionMessage);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);
chrome.commands.onCommand.addListener(handleCommand);
chrome.tabs.onCreated.addListener((tab) => {
  // TBD
});
chrome.tabs.onUpdated.addListener(handleTabUpdated);

async function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  // TODO: rotate highlighted tabs to the front

  if (changeInfo.status !== "complete") return; // if user is dragging
  console.log(`[worker] tab updated [${tabId}]: ${changeInfo.status} ${tab.url}`);
  if (!tab.url) return; // TBD: do we need to remove tabs e.g. when current tab is replaced by blank url?

  // TODO New Tab Page cannot be removed
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

  const validIdentitySharingTabs = identitySharingTabs.filter((tab) => !invalidGroupIds.has(tab.groupId));
  const newGroupId = validIdentitySharingTabs.at(-1)?.groupId;

  /* move tab to group front */
  if (tab.highlighted) {
    await chrome.tabs.move(tabId, { index: 0 });
  }
  const groupId = await chrome.tabs.group({ tabIds: [tabId], groupId: newGroupId });

  chrome.tabGroups.update(groupId, { title: getGroupTitle(identitySharingTabs) });

  /* move group to window front */
  chrome.tabGroups.move(groupId, { index: 0 });
}

async function handleCommand(command: string) {
  switch (command) {
    case "close-tabs-in-group": {
      const groupIds = await chrome.tabs
        .query({ currentWindow: true, highlighted: true })
        .then((tabs) =>
          tabs.map((tab) => tab.groupId).filter((groupId) => groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE),
        );
      await Promise.allSettled(
        groupIds.map((groupId) =>
          chrome.tabs
            .query({ currentWindow: true, groupId })
            .then((tabs) => chrome.tabs.remove(tabs.map((tab) => tab.id!))),
        ),
      );
      break;
    }
    case "highlight-previous-group":
    case "highlight-next-group": {
      const tabs = await chrome.tabs.query({ currentWindow: true });

      const groups = [...groupToMapBy(tabs, (tab) => tab.groupId.toString()).entries()].map(([groupId, tabs]) => ({
        groupId,
        tabs: tabs ?? [],
        highlighted: (tabs ?? []).some((tab) => tab.highlighted),
      }));

      if (command === "highlight-previous-group") groups.reverse();

      const highlightedGroupIndex = groups.findIndex((group) => group.highlighted);
      const nextGroupIndex = (highlightedGroupIndex + 1) % groups.length;
      console.log({ highlightedGroupIndex, nextGroupIndex });
      const nextGroupHeadTabIndex = groups.at(nextGroupIndex)?.tabs.at(0)?.index ?? 0;
      await chrome.tabs.highlight({ tabs: nextGroupHeadTabIndex });

      break;
    }
  }
}

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
  chrome.runtime.openOptionsPage();
}

async function handleExtensionMessage(message: ExtensionMessageRequest) {
  console.log("[worker] received message", message);
}

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}

async function handleBrowserStart() {
  // TODO Start grouping on start
}

// TODO replace with native Map.prototype.groupBy in TypeScript 5.4
function groupToMapBy<T>(array: T[], key: (item: T) => string) {
  const map = array.reduce((map, item) => {
    const group = key(item);
    const list = map.get(group) ?? [];
    list.push(item);
    map.set(group, list);
    return map;
  }, new Map<string, T[]>());

  return map;
}
