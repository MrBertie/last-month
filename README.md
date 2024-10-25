# Last Month plugin for [Obsidian](https://obsidian.md)

Provides a new left sidebar showing a list of all recently created and modified files in your vault, in date order, new at the top, grouped by week.  You can set the date range between 1 and 6 months.


# How to install

Download the [latest version](https://github.com/MrBertie/last-month/archive/refs/heads/main.zip) from this link, and unzip it.  
You see a folder called `last-month-main`; rename this folder as `last-month` and then add it into your `{Obsidian Vault}/.obsidian/plugins` folder.  
Restart Obsidian and go to the *Community Plugins Settings* page to enable the plugin.

*Note: you can also click the `<>Code` button above and choose `Download.zip`*

# How to use

The interface is mostly intuitive and tries to follow the Obsidian standards.

**Files (Notes)**  Click on a file to open it, by default this will be in the most recent tab like the normal File explorer sidebar.  You can also right click for more options, like opening in a new window or split.

**Creating links.**  You can drag and drop a file or tab onto a note to create a new link at the caret.

**Options.**  At the top of the sidebar are four options:
1. Choose the date range, 1 to 6 months.
2. Refresh the view.  It should normally stay in sync with any file, tab, or layout changes.
3. Navigate straight to the plugin settings page.
4. Expand or collapse all the week and open tab headings.


# Available settings

1. Number of months: how many months to show in the listing.
2. Default open location: How to open a note, either a new tab, split, or new window.
3. Hide folders or files: add one or more regular expressions to hide certain folders or files you do not want to show in the sidebar list.  The textbox below this shows the live results of the hide expressions, so that you can quickly see is it is working and producing the result you want.

I personally find this site helpful to learn about and test regular expressions: [RegExr: Learn, Build, & Test RegEx](https://regexr.com).