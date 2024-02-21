import { Subject, filter, map } from "rxjs";

const $tabUpdated = new Subject<{ tabId: number; changeInfo: chrome.tabs.TabChangeInfo; tab: chrome.tabs.Tab }>();
const $tabCreated = new Subject<chrome.tabs.Tab>();
const $command = new Subject<string>();
const $tabGroupUpdated = new Subject<chrome.tabGroups.TabGroup>();

// v2
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => $tabUpdated.next({ tabId, changeInfo, tab }));
chrome.tabs.onCreated.addListener((tab) => $tabCreated.next(tab));
chrome.commands.onCommand.addListener((command) => $command.next(command));
chrome.tabGroups.onUpdated.addListener((tabGroup) => $tabGroupUpdated.next(tabGroup));
chrome.tabGroups.onMoved.addListener((tabGroup) => $tabGroupUpdated.next(tabGroup));

const $closeCurrentGroup = $command.pipe(filter((command) => command === "close-current-group"));
const $tidyUpTabs = $command.pipe(filter((command) => command === "tidy-up-tabs"));
const $cycleNextGroup = $command.pipe(filter((command) => command === "cycle-next-group"));
const $previousTab = $command.pipe(filter((command) => command === "previous-tab"));

// Manually group the tabs
$tidyUpTabs.subscribe(async () => {
  // assign ungrouped tabs to groups
  const unassignedTabs = await chrome.tabs
    .query({ currentWindow: true, groupId: chrome.tabs.TAB_ID_NONE })
    .then((tabs) => tabs.filter((tab) => tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE));
  await Promise.allSettled(unassignedTabs.map((tab) => assignTab(tab)));
});

$previousTab.subscribe(async () => {
  const currentTab = await chrome.tabs.query({ currentWindow: true, highlighted: true }).then((tabs) => tabs.at(0));
  console.log({ findPreviousFor: currentTab });
  if (!currentTab?.openerTabId) return;

  const openerTab = await chrome.tabs.get(currentTab.openerTabId);
  await chrome.tabs.highlight({ tabs: openerTab.index });
});

// TODO remember the active tab within a group
// TODO cycle in the optimal direction
$cycleNextGroup.subscribe(async () => {
  // while the first tab or group is not highlights, cycle until it is so

  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const preGroupTabs = allTabs.map((t, index) => ({
    tab: t,
    vGroupId: t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE ? `_${index}` : t.groupId,
  }));
  const groupedTabs = [...orderedGroupBy(preGroupTabs, (tab) => tab.vGroupId)].map(([groupId, tabs]) => ({
    groupId: typeof groupId === "string" ? chrome.tabGroups.TAB_GROUP_ID_NONE : groupId,
    tabs: tabs.map((tab) => tab.tab),
    highlighted: (tabs ?? []).some((tab) => tab.tab.highlighted),
  }));

  const shiftOffset = groupedTabs.findIndex((group) => group.highlighted) + 1;

  console.log({ groupedTabs, shiftOffset });

  for (let i = 0; i < shiftOffset; i++) {
    // find the first movable thing: group, if not, tab.
    const [firstTab] = await chrome.tabs.query({ currentWindow: true, index: 0 });
    if (!firstTab?.id) continue;

    if (firstTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      await chrome.tabs.move(firstTab.id, { index: -1 });
    } else {
      await chrome.tabGroups.move(firstTab.groupId, { index: -1 });
    }
  }

  // highlight the first tab
  const [newFirstTab] = await chrome.tabs.query({ currentWindow: true, index: 0 });
  await chrome.tabs.highlight({ tabs: newFirstTab.index });
});

// on created, assign group
// TODO dedupe identical URLs
$tabCreated.pipe(map(assignTab)).subscribe();

$closeCurrentGroup.subscribe(async () => {
  // TODO NPT cannot be remove
  const currentTab = await chrome.tabs.query({ currentWindow: true, highlighted: true }).then((tabs) => tabs.at(0));
  console.log({ willCloseTabGroup: currentTab });
  if (!currentTab?.id) return;

  const currentTabGroupId = currentTab?.groupId;

  if (currentTabGroupId === chrome.tabs.TAB_ID_NONE) {
    chrome.tabs.remove(currentTab.id);
    return;
  } else {
    const tabsInGroup = await chrome.tabs.query({ currentWindow: true, groupId: currentTabGroupId });
    await Promise.allSettled(tabsInGroup.filter((tab) => tab.id).map((tab) => chrome.tabs.remove(tab.id!)));
    return;
  }
});

async function assignTab(tab: chrome.tabs.Tab) {
  console.log({ willAssignTab: tab });

  const isNewTab = await new Promise((resolve) => {
    const url = new URL(tab.pendingUrl ?? tab.url ?? "");
    resolve(url.hostname === "newtab");
  }).catch(() => false);

  let newTabId: number | null = null;

  if (isNewTab) {
    // empty url implies empty tab
    newTabId = await chrome.tabs.group({ tabIds: [tab.id!] });
  } else {
    const opener = tab.openerTabId;
    if (opener === undefined) {
      newTabId = await chrome.tabs.group({ tabIds: [tab.id!] });
    } else {
      // group with opener
      const openerTab = await chrome.tabs.get(opener);
      if (openerTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        newTabId = await chrome.tabs.group({ tabIds: [openerTab.id!, tab.id!] });
      } else {
        newTabId = await chrome.tabs.group({ tabIds: [tab.id!], groupId: openerTab.groupId });
      }
    }
  }
}

// const $tabUpsert = merge(
//   $tabUpdated,
//   $tabCreated.pipe(map((tab) => ({ tabId: tab.id!, changeInfo: { status: "created" }, tab }))),
// );

// const $tabUpdatedPerTab = $tabUpsert.pipe(
//   groupBy((update) => update.tabId),
//   map(($group) =>
//     $group.pipe(filter((update) => ["created", "loading", "complete"].includes(update.changeInfo.status as string))),
//   ),
// );

// const $tabLifecycle = $tabUpdatedPerTab.pipe(
//   mergeMap((tab) => {
//     return tab.pipe(
//       scan(
//         (acc, update) => {
//           const baseAcc = acc.some((update: any) => update.status === "complete") ? [] : acc;
//           return [...baseAcc, { tab: update.tab, status: update.changeInfo.status as string }];
//         },
//         [] as { tab: chrome.tabs.Tab; status: string }[],
//       ),
//     );
//   }),
// );

// on created, move openner, then move self
// $tabCreated.subscribe(async (tab) => {
//   const openerId = tab.openerTabId;
//   if (openerId !== undefined) {
//     const openerTab = await chrome.tabs.get(openerId);
//     if (!openerTab.id) return;

//     await chrome.tabs.move(openerTab.id, { index: 0 });
//   }

//   if (tab.id === undefined) return;
//   await chrome.tabs.move(tab.id, { index: openerId === undefined ? 0 : 1 });
// });

// // on loading move tab itself
// $tabUpdated.pipe(filter((update) => update.changeInfo.status === "loading")).subscribe(async (update) => {
//   if (!update.tabId) return;
//   chrome.tabs.move(update.tabId, { index: update.tab.active ? 0 : 1 });
// });

// $tabLifecycle.subscribe((updates) => {
//   console.log(updates);
// });

// v1
chrome.action.onClicked.addListener(handleActionClick);
chrome.runtime.onInstalled.addListener(handleExtensionInstall);
chrome.runtime.onStartup.addListener(handleBrowserStart);
chrome.commands.onCommand.addListener(handleCommand);

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
      const groups = [...orderedGroupBy(tabs, (tab) => tab.groupId.toString()).entries()].map(([groupId, tabs]) => ({
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

async function getPageKey(url: string) {
  return `${await getSiteURLIdentity(url)}`;
}

function getSiteURLIdentity(pageUrl: string) {
  return new Promise<URL>((resolve) => resolve(new URL(pageUrl)))
    .then((validURL) => validURL.host.split(".").slice(-3).join("."))
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

async function handleExtensionInstall() {
  const readerPageUrl = new URL(chrome.runtime.getURL("options.html"));
  chrome.tabs.create({ url: readerPageUrl.toString() });
}

async function handleBrowserStart() {
  // TODO Start grouping on start
}

// TODO replace with native Map.prototype.groupBy in TypeScript 5.4
function orderedGroupBy<T, K extends string | number>(array: T[], key: (item: T) => K) {
  const map = array.reduce((map, item) => {
    const group = key(item);
    const list = map.get(group) ?? [];
    list.push(item);
    map.set(group, list);
    return map;
  }, new Map<K, T[]>());

  return map;
}

// TODO clean up
async function handleTabHighlighted(_highlightInfo: chrome.tabs.TabHighlightInfo) {
  const highlightedTab = await chrome.tabs.query({ currentWindow: true, highlighted: true }).then((tabs) => tabs[0]);

  // rotate highlighted tab group to the front of the window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = [...orderedGroupBy(tabs, (tab) => tab.groupId).entries()].map(([groupId, tabs]) => ({
    groupId,
    tabs: tabs ?? [],
    highlighted: (tabs ?? []).some((tab) => tab.highlighted),
  }));

  const groupsBeforeHighlighted = groups.slice(
    0,
    groups.findIndex((group) => group.highlighted),
  );

  await Promise.allSettled(groupsBeforeHighlighted.map((group) => chrome.tabGroups.move(group.groupId, { index: -1 })));

  // rotate highlighted tab to the front of the group

  const tabsInGroup = await chrome.tabs.query({ currentWindow: true, groupId: highlightedTab.groupId });
  const tabsBeforeHighlighted = tabsInGroup.slice(
    0,
    tabsInGroup.findIndex((tab) => tab.highlighted),
  );

  await Promise.allSettled(
    tabsBeforeHighlighted.map((tab) => chrome.tabs.move(tab.id!, { index: tabsInGroup.length - 1 })),
  );
}

async function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
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
}

function parseSuccessPromise<T>(promise: PromiseSettledResult<T>): T | null {
  if (promise.status === "fulfilled") return promise.value;
  return null;
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
