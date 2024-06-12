'use strict';

const { Plugin, ItemView, setIcon, setTooltip, Setting, EventRef, debounce,
  PluginSettingTab, FileView, Menu, TFile, WorkspaceLeaf } = require('obsidian');

const DEFAULT_SETTINGS = {
  months: 1,
  openType: 'tab',
  hiddenFolders: '',
  locale: 'en-ZA',
};

const Lang = {
  name: 'Last Month',
  openTabs: 'Open tabs',
  openTab: 'Click to activate tab',
  newTab: 'New tab',
  openSettings: 'Open settings',
  updateView: 'Update view',
  noOfMonths: 'No of months',
  lastMonth: 'LAST MONTH',
  lastMonths: 'LAST {count} MONTHS',
  hiddenFolders: 'Hidden folders:',
  invalidRegex: '⚠️ Invalid regular expression',
  tipCollapse: 'Click to collapse',
  tipExpand: 'Click to expand',
  tipCollapseAll: 'Collapse',
  tipExpandAll: 'Expand all',
  lblCloseTab: 'Close this tab',
  lblOpenTab: 'Open in new tab',
  lblOpenRight: 'Open to right',
  optMonths: { 1:'1 month', 2:'2 months', 3:'3 months', 4:'4 months', 5:'5 months', 6:'6 months' },
  optOpenType: { tab: 'Tab', split: 'Split', window: 'Window', },
}

const LAST_MONTH_VIEW = 'last-month';

class LastMonthPlugin extends Plugin {
  options;
  constructor() {
    super(...arguments);
  }

  async onload() {
    await this.loadSettings();

    this.registerView(
      LAST_MONTH_VIEW,
      (leaf) => (this.view = new LastMonthView(leaf, this)),
    );
    
    this.addCommand({
      id: 'last-month-open',
      name: 'Open',
      callback: this.activateView.bind(this),
    });

    // Register in "Settings > Page Previews > Last Month" (i.e. Ctrl to show)
    this.app.workspace.registerHoverLinkSource(LAST_MONTH_VIEW, {
      display: Lang.name,
      defaultMod: true,
    });

    this.app.workspace.onLayoutReady(this.activateView.bind(this));

    this.addSettingTab(new LastMonthSettingTab(this.app, this));

    console.log('%c' + this.manifest.name + ' ' + this.manifest.version +
      ' loaded', 'background-color: teal; padding:4px; border-radius:4px');
  }

  onunload() {
    this.app.workspace.unregisterHoverLinkSource(LAST_MONTH_VIEW);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    const [leaf] = workspace.getLeavesOfType(LAST_MONTH_VIEW);
    if (!leaf) {
      await this.app.workspace
        .getLeftLeaf(false) // false = no split
        .setViewState({
          type: LAST_MONTH_VIEW,
          active: true,
        });
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

class LastMonthView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.settings = plugin.settings;
    this.menu = this.buildMonthMenu();
    this.collapsed = false;
    this.hidden = {};
  }

  async onOpen() {
    this.addNavButtons();
    this.updateView();
  }

  getViewType() {
    return LAST_MONTH_VIEW;
  }

  getDisplayText() {
    return Lang.name;
  }

  getIcon() {
    return 'history';
  }

  load() {
    super.load();
    this.registerEvent(this.app.vault.on('rename', this.updateView.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.updateView.bind(this)));
    this.registerEvent(this.app.workspace.on('file-open', this.updateView.bind(this)));
    this.registerEvent(this.app.workspace.on('layout-change', this.updateView.bind(this)));
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.updateView.bind(this)));
  }

  /* ⚒️ INTERNAL FUNCTIONS */

  addNavButtons() {
    const nav = createDiv({ cls: 'nav-header' });
    this.containerEl.parentElement.prepend(nav);
    const buttons = nav.createDiv({ cls: 'nav-buttons-container' });
  
    const monthBtn = buttons.createDiv({ cls: 'clickable-icon nav-action-button' });
    setIcon(monthBtn, 'calendar');
    setTooltip(monthBtn, Lang.noOfMonths, { placement: 'bottom' });
    monthBtn.onclick = (evt) => {
      this.menu.showAtMouseEvent(evt);
      evt.stopPropagation();
    }
    const updateBtn = buttons.createDiv({ cls: 'clickable-icon nav-action-button' });
    setIcon(updateBtn, 'refresh-cw');
    setTooltip(updateBtn, Lang.updateView, { placement: 'bottom' });
    updateBtn.onclick = () => {
      this.updateView();
    }
    const settingsBtn = buttons.createDiv({cls: 'clickable-icon nav-action-button' });
    setIcon(settingsBtn, 'settings');
    setTooltip(settingsBtn, Lang.openSettings, { placement: 'bottom' });
    settingsBtn.onclick = () => {
      this.openSettings();
    }
    const collapseBtn = buttons.createDiv({cls: 'clickable-icon nav-action-button' });
    setIcon(collapseBtn, 'chevrons-down-up');  // default
    setTooltip(collapseBtn, Lang.tipCollapseAll, { placement: 'bottom' }); //default
    collapseBtn.onclick = () => {
      this.collapsed = !this.collapsed;
      this.contentEl
        .querySelectorAll('.tree-item-children')
        .forEach((el) => {
          if (this.collapsed) {
            el.addClass('is-collapsed');
            setIcon(collapseBtn, 'chevrons-up-down');
            setTooltip(collapseBtn, Lang.tipExpandAll, { placement: 'bottom' });
          } else {
            el.removeClass('is-collapsed');
            setIcon(collapseBtn, 'chevrons-down-up');
            setTooltip(collapseBtn, Lang.tipExpandAll, { placement: 'bottom' });
          }
        });
    }
  }

  /**
   * 
   * @param {EventRef} eventRef 
   * @returns {void}
   */
  updateView(evt) {
    if (this === undefined) return; // duplicated events?
    if (evt instanceof WorkspaceLeaf && 
      evt.getViewState().type === LAST_MONTH_VIEW) return;

    const weeks = this.fetchFiles();
    const tabs = this.getOpenTabs();
    weeks.set(Lang.openTabs, tabs);
    
    // 🔆Grand total of recent files
    let total = 0;
    weeks.forEach(item => total += item.length);
    
    const rootEl = this.contentEl;
    rootEl.empty();
    rootEl.addClass('lmp');

    // 🔆Total count header
    const totalEl = createDiv({ cls: 'tree-item lmp-total' });
    const titleEl = totalEl.createDiv({ cls: 'tree-item-self'});
    const iconEl = titleEl.createDiv({ cls: 'tree-item-icon' });
    setIcon(iconEl, 'calendar-range');
    const innerEl = titleEl.createDiv({ cls: 'tree-item-inner' });
    let title = '';
    if (this.settings.months > 1) {
      title = Lang.lastMonths.replace('{count}', this.settings.months);
    } else {
      title = Lang.lastMonth;
    }
    const textEl = innerEl.createSpan({ cls: 'tree-item-inner-text', text: title });
    const flairEl = titleEl.createDiv({ cls: 'tree-item-flair-outer' });
    flairEl.createSpan({ cls: 'tree-item-flair', text: total });
    setTooltip(flairEl, 
      Lang.hiddenFolders + '\u{000A}—\u{000A}' + this.settings.hiddenFolders.replace('\n', '\u{000A}'));

    weeks.forEach((hits, hdr) => {
      // 🔆Group headers for each week
      const itemEl = rootEl.createDiv({ cls: 'tree-item' });
      const headerEl = itemEl.createDiv({ cls: 'tree-item-self is-clickable ' });
      setTooltip(headerEl, Lang.tipCollapse, { placement: 'right' });
      const iconEl = headerEl.createDiv({ cls: 'tree-item-icon' });
      const innerEl = headerEl.createDiv({ cls: 'tree-item-inner' });
      const textEl = innerEl.createSpan({
        cls: 'tree-item-inner-text',
        text: hdr.toUpperCase(),
      });
      const flairEl = headerEl.createDiv({ cls: 'tree-item-flair-outer' });
      let count = hits.length;
      flairEl.createSpan({ cls: 'tree-item-flair', text: count });
      // Either tabs or files
      if (hdr == Lang.openTabs) {
        this.tabsEl = itemEl.addClass('lmp-tabs');
        setIcon(iconEl, 'file-stack');
      } else {
        itemEl.addClass('lmp-header');
        setIcon(iconEl, 'calendar');
      }
      
      // Expand/Collapse header
      headerEl.onclick = (evt) => {
        evt.preventDefault();
        const collapsed = childrenEl.classList.toggle('is-collapsed');
        const tip = (collapsed ? Lang.tipExpand : Lang.tipExpand);
        setTooltip(headerEl, tip);
      }
      
      // 🔆Children: Matching files for each week header
      const childrenEl = itemEl.createDiv({ cls: 'tree-item-children' });
      hits.forEach(hit => {
        const fileEl = childrenEl.createDiv({ cls: 'tree-item nav-file lmp-file' });
        let stat = '';
        if (hit.name !== Lang.newTab) {
          stat = hit.path + 
            '\u{000A}⇄ ' + new Date(hit.file?.stat.mtime).toLocaleString(DEFAULT_SETTINGS.locale) + 
            '\u{000A}\u{263C} ' + new Date(hit.file?.stat.ctime).toLocaleString(DEFAULT_SETTINGS.locale);
        }
        const tip = (hit.type == 'tab' ? Lang.openTab + '\u{000A}—\u{000A}' : '') + stat;
        setTooltip(fileEl, tip, { placement: 'right' });
        const titleEl = fileEl.createDiv({
          cls: 'tree-item-self is-clickable nav-file-title lmp-title',
        });
        const iconEl = titleEl.createDiv({ cls: 'tree-item-icon' });
        const textEl = titleEl.createDiv({
          cls: 'tree-item-inner nav-file-title-content lmp-title-content' 
        });
        textEl.setText(hit.name);
        let icon;
        // formatting for tabs vs. files
        if (hit.type == 'tab') {
          icon = 'grip-vertical';
          textEl.addClass('lmp-tab');
          iconEl.addClass('lmp-tab');
          if (hit.active) titleEl.addClass('is-active');
        } else {
          icon = (hit.new ? 'file-plus-2' : 'file');
        }
        setIcon(iconEl, icon);

        if (hit.active) {
          titleEl.addClass('is-active');
        }

        // Drag file to editor to create a link
        titleEl.setAttr('draggable', 'true');
        titleEl.addEventListener('dragstart', (event) => {
          const file = this.app.metadataCache.getFirstLinkpathDest(hit.path, '');
          const dragManager = this.app.dragManager;
          const dragData = dragManager.dragFile(event, file);
          dragManager.onDragStart(event, dragData);
        });

        // File preview popover
        titleEl.addEventListener('mouseover', (event) => {
          this.app.workspace.trigger('hover-link', {
            event,
            source: LAST_MONTH_VIEW,
            hoverParent: rootEl,
            targetEl: fileEl,
            linktext: hit.path,
          });
        });

        if (hit.type == 'tab') {
          // Option to close this tab
          titleEl.addEventListener('contextmenu', (event) => {
            const file = this.app.vault.getAbstractFileByPath(hit.path);
            const menu = new Menu();
            menu.addItem(item => {
              item.setTitle(Lang.lblCloseTab);
              item.setIcon('x');
              item.setSection('open');
              item.onClick(() => hit.leaf.detach());
            });
            this.app.workspace.trigger('file-menu', menu, file, '');
            menu.showAtPosition({ x: event.clientX, y: event.clientY });
          });

          // Activate this tab on click
          titleEl.addEventListener('click', (event) => {
            this.app.workspace.setActiveLeaf(hit.leaf);
          });
        } else {
          // Add the extra open location options to the the file context menu
          titleEl.addEventListener('contextmenu', (event) => {
            const file = this.app.vault.getAbstractFileByPath(hit.path);
            const menu = new Menu();
            menu.addItem(item => {
              item.setTitle(Lang.lblOpenTab);
              item.setIcon('file-plus');
              item.setSection('open');
              item.onClick(() => this.openFile(hit, false, options.tab));
            });
            menu.addItem(item => {
              item.setTitle(Lang.lblOpenRight);
              item.setIcon('separator-vertical');
              item.setSection('open');
              item.onClick(() => this.openFile(hit, false, options.split));
            });
            this.app.workspace.trigger('file-menu', menu, file, '');
            menu.showAtPosition({ x: event.clientX, y: event.clientY });
          });
  
          // Open a new tab/split/window on click
          // TODO: open in a new tab is not already open?
          titleEl.addEventListener('click', (event) => {
            this.openFile(hit, event.ctrlKey || event.metaKey);
          });
        }
      });

      rootEl.appendChild(childrenEl);
      // Insert the totals header after the tabs group
      if (hdr == Lang.openTabs) {
        rootEl.appendChild(totalEl);
      }
    });
  }

  buildMonthMenu() {
    const menu = new Menu();
    for (const [key, value] of Object.entries(Lang.optMonths) ) {
      menu.addItem(item => {
        item.setTitle(value)
        item.setIcon('calendar')
        item.setChecked(key == this.settings.months)
        item.onClick(() => {
          this.settings.months = Number(value.substring(0, 1));
          this.menu = this.buildMonthMenu();
          this.plugin.saveSettings();
          this.updateView();
        });
      });
    }
    return menu;
  }

  openSettings() {
    this.app.setting.open();
    if (this.app.setting.lastTabId !== this.plugin.manifest.id) {
        this.app.setting.openTabById(this.plugin.manifest.id);
    }
  }

  /**
   * Open the provided file in the most recent leaf.
   * @param {TFile} file
   * @param {boolean} split 
   * Should file be opened in a new split, or in the most recent split. 
   * True if most recent split is pinned.
   * @param {string} target
   * @returns {void}
   */
  openFile(hit, split = false, target = null) {
    // sanity check to be sure the file still exists
    const target_file = this.app.vault.getFileByPath(hit.file.path);
    if (target_file) {
      let leaf = this.app.workspace.getMostRecentLeaf();
      const create_leaf = split || leaf.getViewState().pinned;
      if (create_leaf) {
        if (target === options.split || this.plugin.settings.openType === 'split') {
          leaf = this.app.workspace.getLeaf('split');
        } else if (target === options.window || this.plugin.settings.openType === 'window') {
          leaf = this.app.workspace.getLeaf('window');
        } else if (target === options.tab || this.plugin.settings.openType === 'tab') {
          leaf = this.app.workspace.getLeaf('tab');
        }
      }
      leaf.openFile(target_file);
    }
  }

  /** TFileHit type
   * @typedef {Object} THit
   * @property {TFile} file
   * @property {string} name
   * @property {string} path
   * @property {Date} date
   * @property {boolean} new
   * @property {WorkspaceLeaf} leaf
   * @property {string} type
   */

  /** @typedef {Map<string, Array<THit>>} THits */

  /**
   * Fetch created and modified files from recent months (setting)
   * If a file was created and then modified in the same week then the created one is shown
   * @returns {THits} key = group header; values = [] of THit
   */
  fetchFiles() {
    const today = new Date();
    const cutoff = today.setMonth(today.getMonth() - this.settings.months);
    const patterns = (this.settings.hiddenFolders ? this.settings.hiddenFolders.split('\n') : []);
    const files = this.app.vault.getMarkdownFiles();
    const active_file = this.app.workspace.getActiveFile();
    const active_path = (active_file ? active_file.path : '');
    const hide_file = hideFile.bind(this);
    this.hidden = {};

    const hits = files
      .filter((file) => {
        const include = !hide_file(file.path) && 
          (file.stat.ctime > cutoff || file.stat.mtime > cutoff);
        return include;
        })
      .map((file) => {
        const cweek = getMonday(file.stat.ctime);
        const mweek = getMonday(file.stat.mtime);
        const is_new = (cweek === mweek); // created during this week
        /** @type {THit} */
        const hit = {
          file: file,
          name: file.basename,
          path: file.path,
          date: file.stat.mtime,
          week: mweek,
          new: is_new,
          leaf: null,
          type: 'file',
          active: file.path === active_path,
        }
        return hit;
      })
      .sort((a, b) => b.date - a.date);

    const grps = new Map().set(Lang.openTabs, []);  // Top group for the open tabs to add later

    hits.forEach((hit) => {
      const hdr = getHeader(hit.week);
      if (!grps.has(hdr)) {
        grps.set(hdr, []);
      }
      grps.get(hdr).push(hit);
    });
    return grps;
    
    // memoize the header to save a few ms
    function getHeader(week, cache = {}) {
      if (week in cache) return cache(week);
      const sow = new Date(week);
      const eow = addDays(sow, 6);
      const bom = sow.toLocaleString('en-US', { month: 'short' });
      const eom = eow.toLocaleString('en-US', { month: 'short' });
      const xmth = (bom === eom) ? '' : '\u{2008}' + eom; // 2008 = punc. space
      cache[week] = bom + ' ' + sow.getDate() + '\u{2009}\u{2013}' + xmth + ' ' + eow.getDate();  // 2009 = hairspace
      return cache[week];
    }

    function addDays(date, days) {
      let result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    }
    // the first day of the week (Monday by default)
    function getMonday(date) {
      date = new Date(date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
      return new Date(date.setDate(diff)).toDateString();
    }

    function hideFile(path) {
      let hide = false
      if (patterns) {
        hide = patterns.some((pattern) => {
          let match;
          let valid;
          if (!pattern) {
            match = false;
          } else {
            try {
              match = new RegExp(pattern).test(path);
              valid = true;
            } catch(error) {
              match = true;
              valid = false;
            }
          }
          if (match) {
            if (!this.hidden[pattern]) this.hidden[pattern] = '';
            if (valid) {
              this.hidden[pattern] += '  — ' + path + '\n';
            } else {
              this.hidden[pattern] = '  — ' + Lang.invalidRegex + '\n';
            }
          }
          return match;
        });
      }
      return hide;
    }
  }

  /**
   * @returns {Array<THit>}}
   */
  getOpenTabs() {
    /** @type {Array<THit>} */
    let tabs = [];
    const active_id = this.app.workspace.getMostRecentLeaf().id;
    this.app.workspace.iterateRootLeaves((leaf) => {
      /** @type {TFile} */
      const view = leaf.view;
      let hit = {};
      if (view instanceof FileView && view.file?.name) {
        const file = view.file;
        hit = {
          file: file,
          name: file.basename,
          path: file.path,
          date: file.stat.mtime,
          new: false,
          week: null,
          leaf: leaf,
          type: 'tab',
          active: leaf.id === active_id,
        }
      } else {
        let name = leaf.view.getViewType();
        name = name == 'empty' ? Lang.newTab : name;
        hit = {
          file: undefined,
          name: name,
          path: '',
          date: new Date(),
          new: true,
          week: null,
          leaf: leaf,
          type: 'tab',
          active: leaf.id === active_id,
        }
      }
      tabs.push(hit);
    });
    return tabs;
  }
}

class LastMonthSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.hidden = undefined;
  }
  display() {
    const hidden_folders = () => {
      let folders = '';
      Object.entries(this.plugin.view.hidden).forEach(([key, value]) => {
        folders += '▶ ' + key + ' ◀\n' + value + '\n';
      });
      return folders;
    }

    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName(this.plugin.manifest.name)
      .setHeading();

    new Setting(containerEl)
    .setName('Number of months')
    .setDesc(
      'Number of recent months to show'
    )
    .addDropdown((dropdown) => {
      dropdown
        .addOptions(Lang.optMonths)
        .setValue(this.plugin.settings.months)
        .onChange(async (value) => {
          this.plugin.settings.months = value;
          await this.plugin.saveSettings();
          this.plugin.view.updateView();
        })
    });

    new Setting(containerEl)
      .setName('Default open location')
      .setDesc(
        'When a note is clicked should it open in a new tab, split, or window (desktop only)'
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(Lang.optOpenType)
          .setValue(this.plugin.settings.openType)
          .onChange(async (value) => {
            this.plugin.settings.openType = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Hide folders or files')
      .setDesc('Use regular expression patterns to hide certain folders and files. You can add one per line. Check your results in the list below.')
      .addTextArea((text) => {
        text
          .setPlaceholder('^daily/\n\\.png$\nfoobar.*baz')
          .setValue(this.plugin.settings.hiddenFolders)
          .onChange(debounce(async (value) => {
            this.plugin.settings.hiddenFolders = value;
            this.plugin.saveSettings();
            this.plugin.view.updateView();
            this.hidden.setValue(hidden_folders());
          }, 1000, true));
        text.inputEl.cols = 35;
        text.inputEl.rows = 4;
      });

      
    new Setting(containerEl)
      .setName('List of hidden files or folders')
      .setDesc('For checking purposes.\u{000A}A list of all the hidden folders matched by the above regular expressions.\u{000A}Also shows invalid expressions so that you can correct them.')
      .addTextArea((text) => {
        text.setValue(hidden_folders());
        text.inputEl.cols = 35;
        text.inputEl.rows = 20;
        this.hidden = text;
      });
  }
}


module.exports = {
  default: LastMonthPlugin,
}