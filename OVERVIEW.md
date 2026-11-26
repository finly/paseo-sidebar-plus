Sidebar+ is a sidebar view where you create groups for your projects, or group workspaces by status or label. Workspace rows show agent status and can include branch, pull request, checks, and service details.

## Setup

- Requires Paseo 0.16.0 or later on the daemon and the app.
- After installing, choose **Sidebar+** in **Settings > Sidebar**. Pick the default sidebar there to switch back.
- Select the sliders button at the top of the view to open **Display preferences**. Change row fields, text size, row height, or indentation there.
- Available in English, Chinese (Simplified), Japanese, Korean, Spanish, French, Portuguese (Brazil), Russian, and Arabic.

## Organize

- **Groups and subgroups:** put projects in groups, one subgroup level deep, each with a color and an icon or emoji.
- **Drag to arrange:** reorder groups, subgroups, projects, and Pinned workspaces, or drag a project into another group. On touch, long-press first.
- **Collapse:** collapsed groups and projects show a count, plus a status dot when work needs attention or is running.
- **Group by:** project, status, or label.
- **Sort:** by name, last activity, or creation date, or drag workspaces into a manual order.

## Workspace rows

- **Status:** running, needs input, attention, done, or failed.
- **Line 1:** the title, and last activity when that option is on.
- **Fields:** branch, project, pull request, checks, diff stats, running services, and labels. Put each on line 2 or line 3, or hide it. Pinned rows keep their project visible.
- **Pull requests:** number and state, when the host has them. Press a pull request with a link to open it in your browser.
- **Services:** running services, with ports when available.
- **Short rows:** empty lines collapse, so simple workspaces stay one line tall.

## Find

- **Search:** matches title, branch, project, label, and host.
- **Filters:** by host, project, or label.
- **Jump to current:** brings the open workspace back into view and expands its group if needed.
- **Sticky headings:** keep the current group and project in view on web and desktop.

## Act

- **Workspace menu:** copy path or branch, rename, pin, labels, and archive with a confirm step.
- **Project menu:** new workspace, copy path, color and icon, move to group, and archive workspaces.
- **Bulk archive:** archive many workspaces from a project at once, with quick picks for done, merged, and idle workspaces. Running, needs input, pinned, and currently open workspaces, and those with an open or draft PR, are unselected by default.

## Data access

- Reads workspaces, projects, and hosts from your connected Paseo hosts. This includes pull request, checks, and service details.
- Changes a workspace (rename, pin, labels, archive) only when you choose that action.
- Groups, project order, heading colors and icons, display preferences, and manual workspace and Pinned order are saved in plugin settings on the Paseo host and shared by its devices.
- Filters and collapsed state are saved on each device.
- Contacts no service outside Paseo. Pull request links open in your browser.
