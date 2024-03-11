# Web Extension Starter

## Available keys

- Ctrl-1/2/3/4
- Ctrl-Q/W/G/Space

## Ideas

All actions should preserve pinned items

- Ctrl-T
  - In tab: Open and highlight new tab
  - In group: Open and highlight new tab in the same group
  - Ctrl-Shift-T: open new tab (same as the default Ctrl-T)
- Ctrl-W
  - In tab: close current tab and focus next
  - In group: close current group (or current tab is not in group) and focus next
  - Ctrl-Shift-W: same as the default Ctrl-W
- Ctrl-G
  - Some tab is in group: ungroup
  - No tab is in group: group by tree
  - Must self stablize: when there is no group, CtrlSpace twice should not change anything
- Ctrl-Space
  - In tab: Close other tabs and groups
  - In group: Close other tabs in group, and ungroup current group
  - Pressing twice always result closing all other tabs
- Ctrl-3/Ctrl-4
  - Prev/next is a tab: prev/next tab
  - Prev/next is a group: prev/next group's last accessed tab (or last tab if none accessed)

## New tab behavior (Ctrl-T)

- If current tab is in group, open in the same group
- If current tab is not in group, create group and open in the group

## Opener tracking

- If open new tab from group, the new tab belong to the group
- If open new tab from tab, blank tabs start a new group, other tabs still belong to the same group
