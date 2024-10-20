'use strict';

const { Plugin, ItemView, DeferredView, setIcon, setTooltip, Setting, EventRef, debounce,
  PluginSettingTab, FileView, Menu, TFile, WorkspaceLeaf } = require('obsidian');

const DEFAULT_SETTINGS = {
  countMonths: 1,
  openType: 'tab',
  hiddenFolders: '',
  rainbowHeaders: true,
  dateLocale: 'en-ZA',
};

const Lang = {
  name: 'Last Month',
  // openTabs: 'Open tabs',
  // openTab: 'Click to activate tab',
  newTab: 'New tab',
  openSettings: 'Open settings',
  updateView: 'Update view',
  noOfMonths: 'No of months',
  lastMonth: 'LAST MONTH',
  lastMonths: 'LAST {count} MONTHS',
  hiddenFolders: 'Hidden folders:',
  invalidRegex: '⚠️ Invalid regular expression',
  collapseTip: 'Click to collapse',
  expandTip: 'Click to expand',
  collapseAllTip: 'Collapse',
  expandAllTip: 'Expand all',
  // closeTabLabel: 'Close this tab',
  openTabLabel: 'Open in new tab',
  openRightLabel: 'Open to right',
  monthOptions: { 1:'1 month', 2:'2 months', 3:'3 months', 4:'4 months', 5:'5 months', 6:'6 months' },
  openTypeOptions: { tab: 'Tab', split: 'Split', window: 'Window', },
}

const LAST_MONTH_VIEW = 'last-month';

class LastMonthPlugin extends Plugin {
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
      name: 'Open sidebar',
      callback: this.activateView.bind(this),
    });

    // Register in "Settings > Page Previews > Last Month" (i.e. Ctrl to show Preview)
    this.app.workspace.registerHoverLinkSource(LAST_MONTH_VIEW, {
      display: Lang.name,
      defaultMod: true,
    });

    //this.app.workspace.onLayoutReady(this.activateView.bind(this));

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
    let leaf = workspace.getLeavesOfType(LAST_MONTH_VIEW).first();
    if (!leaf) {
      leaf = workspace.getRightLeaf(false); // false => no split
      await leaf.setViewState({
          type: LAST_MONTH_VIEW,
          active: true,
        });
    }
    workspace.revealLeaf(leaf);
  }
}

class LastMonthView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.settings = plugin.settings;
    this.menu = this.buildMonthMenu();
    this.collapsed = false;
    this.hiddenFiles = {};
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
    const navEl = createDiv({ cls: 'nav-header' });
    const buttonsEl = navEl.createDiv({ cls: 'nav-buttons-container' });
  
    const monthBtn = buttonsEl.createDiv({ cls: 'clickable-icon nav-action-button' });
    setIcon(monthBtn, 'calendar');
    setTooltip(monthBtn, Lang.noOfMonths, { placement: 'bottom' });
    monthBtn.onclick = (event) => {
      this.menu.showAtMouseEvent(event);
      event.stopPropagation();
    }

    const updateBtn = buttonsEl.createDiv({ cls: 'clickable-icon nav-action-button' });
    setIcon(updateBtn, 'refresh-cw');
    setTooltip(updateBtn, Lang.updateView, { placement: 'bottom' });
    updateBtn.onclick = () => {
      this.updateView();
    }

    const settingsBtn = buttonsEl.createDiv({cls: 'clickable-icon nav-action-button' });
    setIcon(settingsBtn, 'settings');
    setTooltip(settingsBtn, Lang.openSettings, { placement: 'bottom' });
    settingsBtn.onclick = () => {
      this.openSettings();
    }

    const collapseBtn = buttonsEl.createDiv({cls: 'clickable-icon nav-action-button' });
    setIcon(collapseBtn, 'chevrons-down-up');  // default
    setTooltip(collapseBtn, Lang.collapseAllTip, { placement: 'bottom' }); //default
    collapseBtn.onclick = () => {
      this.collapsed = !this.collapsed;
      this.contentEl
        .querySelectorAll('.tree-item-children')
        .forEach((el) => {
          if (this.collapsed) {
            el.addClass('is-collapsed');
            setIcon(collapseBtn, 'chevrons-up-down');
            setTooltip(collapseBtn, Lang.expandAllTip, { placement: 'bottom' });
          } else {
            el.removeClass('is-collapsed');
            setIcon(collapseBtn, 'chevrons-down-up');
            setTooltip(collapseBtn, Lang.expandAllTip, { placement: 'bottom' });
          }
        });
    }
    this.containerEl.parentElement.prepend(navEl); // Add at the top of the main view div
  }

  /**
   * 
   * @param {EventRef} eventRef 
   * @returns {void}
   */
  updateView(event) {
    if (this === undefined) return; // duplicated events?
    if (event instanceof WorkspaceLeaf && 
      event.getViewState().type === LAST_MONTH_VIEW) return;

    const { groups: groupHeaders, meta } = this.getRecentFiles();
    
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass('lmp');

    // 🔆Header for the Total Count
    const totalEl = createDiv({ cls: 'tree-item lmp-total' });
    const titleEl = totalEl.createDiv({ cls: 'tree-item-self'});
    setTooltip(titleEl, meta.last + ' — ' + meta.first);
    const iconEl = titleEl.createDiv({ cls: 'tree-item-icon' });
    setIcon(iconEl, 'calendar-range');
    const innerEl = titleEl.createDiv({ cls: 'tree-item-inner' });
    let title;
    if (this.settings.months > 1) {
      title = Lang.lastMonths.replace('{count}', this.settings.countMonths);
    } else {
      title = Lang.lastMonth; 
    }
    const textEl = innerEl.createSpan({ cls: 'tree-item-inner-text', text: title });
    const flairEl = titleEl.createDiv({ cls: 'tree-item-flair-outer' });
    flairEl.createSpan({ cls: 'tree-item-flair', text: meta.total });
    setTooltip(flairEl, 
      Lang.hiddenFolders + '\u{000A}—\u{000A}' + this.settings.hiddenFolders.replace('\n', '\u{000A}'));

    contentEl.appendChild(totalEl);

    let color = 0;
    groupHeaders.forEach((hits, header) => {

      // 🔆Headers for the Week Groups
      const itemEl = contentEl.createDiv({ cls: 'tree-item' });
      const headerEl = itemEl.createDiv({ cls: 'tree-item-self is-clickable ' });
      setTooltip(headerEl, Lang.collapseTip, { placement: 'right' });
      const iconEl = headerEl.createDiv({ cls: 'tree-item-icon' });
      const innerEl = headerEl.createDiv({ cls: 'tree-item-inner' });
      const textEl = innerEl.createSpan({
        cls: 'tree-item-inner-text',
        text: header.toUpperCase(),
      });
      const flairEl = headerEl.createDiv({ cls: 'tree-item-flair-outer' });
      let count = hits.length;
      flairEl.createSpan({ cls: 'tree-item-flair', text: count });
      itemEl.addClass('lmp-header');
      setIcon(iconEl, 'calendar');
      if (this.settings.rainbow) {
        textEl.addClass('lmp-color-' + (color % 8));
        color++;
      }
      
      // Enable Expand/Collapse of header
      headerEl.onclick = (event) => {
        event.preventDefault();
        const collapsed = childrenEl.classList.toggle('is-collapsed');
        const tip = (collapsed ? Lang.expandTip : Lang.expandTip);
        setTooltip(headerEl, tip);
      }
      
      // 🔆Children: Matching files for each Week header
      const childrenEl = itemEl.createDiv({ cls: 'tree-item-children' });
      hits.forEach(hit => {

        const fileEl = childrenEl.createDiv({ cls: 'tree-item nav-file lmp-file' });
        const tip = hit.path + 
            '\u{000A}⇄ ' + new Date(hit.file?.stat.mtime).toLocaleString(DEFAULT_SETTINGS.dateLocale) + 
            '\u{000A}\u{263C} ' + new Date(hit.file?.stat.ctime).toLocaleString(DEFAULT_SETTINGS.dateLocale);
        setTooltip(fileEl, tip, { placement: 'right' });
        const titleEl = fileEl.createDiv({
          cls: 'tree-item-self is-clickable nav-file-title lmp-title',
        });
        const iconEl = titleEl.createDiv({ cls: 'tree-item-icon' });
        const textEl = titleEl.createDiv({
          cls: 'tree-item-inner nav-file-title-content lmp-title-content',
          text: hit.name,
        });
        const icon = (hit.new ? 'file-plus-2' : 'file');
        setIcon(iconEl, icon);

        if (hit.active) {
          titleEl.addClass('is-active');
        }
        if (hit.leaf) {
          titleEl.addClass('is-open');
        }

        // Drag file to editor to create a link
        titleEl.setAttr('draggable', 'true');
        titleEl.addEventListener('dragstart', (event) => {
          const file = this.app.metadataCache.getFirstLinkpathDest(hit.path, '');
          const dragManager = this.app.dragManager;
          const dragData = dragManager.dragFile(event, file);
          dragManager.onDragStart(event, dragData);
        });

        // Trigger the file preview popover
        titleEl.addEventListener('mouseover', (event) => {
          this.app.workspace.trigger('hover-link', {
            event,
            source: LAST_MONTH_VIEW,
            hoverParent: contentEl,
            targetEl: fileEl,
            linktext: hit.path,
          });
        });

        // Add the extra open location options to the the file context menu
        titleEl.addEventListener('contextmenu', (event) => {
          const file = this.app.vault.getAbstractFileByPath(hit.path);
          const menu = new Menu();
          menu.addItem(item => {
            item.setTitle(Lang.openTabLabel);
            item.setIcon('file-plus');
            item.setSection('open');
            item.onClick(() => this.openFile(hit, false, options.tab));
          });
          menu.addItem(item => {
            item.setTitle(Lang.openRightLabel);
            item.setIcon('separator-vertical');
            item.setSection('open');
            item.onClick(() => this.openFile(hit, false, options.split));
          });
          this.app.workspace.trigger('file-menu', menu, file, '');
          menu.showAtPosition({ x: event.clientX, y: event.clientY });
        });

        // Open a new tab/split/window on click
        // TODO: open in a new tab if not already open? Difficult!
        titleEl.addEventListener('click', (event) => {
          this.openFile(hit, event.ctrlKey || event.metaKey);
        });
      });
      contentEl.appendChild(childrenEl);
    });
    // TODO append list of open files for troubleshooting purposes (in small muted font)
  }

  buildMonthMenu() {
    const menu = new Menu();
    for (const [key, value] of Object.entries(Lang.monthOptions) ) {
      menu.addItem(item => {
        item.setTitle(value)
        item.setIcon('calendar')
        item.setChecked(key == this.settings.countMonths)
        item.onClick(() => {
          this.settings.countMonths = Number(value.substring(0, 1));
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
    this.app.setting.openTabById(this.plugin.manifest.id);
  }

  /**
   * Open the provided file in the most recent leaf.
   * @param {THit} hit
   * @param {boolean} split 
   * Should file be opened in a new split, or in the most recent split. 
   * True if most recent split is pinned.
   * @param {string} openType how should the tab be opened
   * @returns {void}
   */
  openFile(hit, split = false, openType = null) {
    // sanity check to be sure the file still exists
    const targetFile = this.app.vault.getFileByPath(hit.file.path);
    if (targetFile) {
      // Is the file already open in a tab/window somewhere?
      if (hit.leaf) {
        this.app.workspace.setActiveLeaf(hit.leaf);
      } else {
        let leaf = this.app.workspace.getMostRecentLeaf();
        const canCreateLeaf = split || leaf.getViewState().pinned;
        if (canCreateLeaf) {
          if (openType === options.split || this.plugin.settings.openType === 'split') {
            leaf = this.app.workspace.getLeaf('split');
          } else if (openType === options.window || this.plugin.settings.openType === 'window') {
            leaf = this.app.workspace.getLeaf('window');
          } else if (openType === options.tab || this.plugin.settings.openType === 'tab') {
            leaf = this.app.workspace.getLeaf('tab');
          }
        }
        leaf.openFile(targetFile);
      }
    }
  }

  /**
   * @typedef {Object} THit
   * @property {TFile} file
   * @property {string} name
   * @property {string} path
   * @property {Date} date
   * @property {Date} week
   * @property {boolean} new
   * @property {WorkspaceLeaf} leaf
   * @property {string} type
   * @property {boolean} active
   */

  ///** @typedef {Map<string, Array<THit>>} THits */

  /**
   * @typedef {Map} THits
   * @property {string} header
   * @property {Array<THit>}
   */

  /**
   * Get created and modified files from recent months (setting)
   * If a file was created and then modified in the same week then the created one is shown
   * @returns {{THits, Object}} THits, meta: {first, last, total}
   */
  getRecentFiles() {
    const today = new Date();
    let cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.settings.countMonths);
    const patterns = (this.settings.hiddenFolders ? this.settings.hiddenFolders.split('\n') : []);
    const files = this.app.vault.getMarkdownFiles();
    const active_file = this.app.workspace.getActiveFile();
    const active_path = (active_file ? active_file.path : '');
    const hide_file = hideFile.bind(this);
    const meta = { 
      first: today.toLocaleString('en-US', { month: 'short', day: 'numeric' }), // e.g. "May 10"
      last: cutoff.toLocaleString('en-US', { month: 'short', day: 'numeric' }), 
      total: 0 
    };
    this.hiddenFiles = {};
    const openTabs = this.getOpenTabs();

    const hits = files
      .filter((file) => {
        const include = !hide_file(file.path) && 
          (file.stat.ctime > cutoff || file.stat.mtime > cutoff);
        return include;
        })
      .map((file) => {
        const cweek = getMonday(file.stat.ctime);
        const mweek = getMonday(file.stat.mtime);
        const isNew = (cweek === mweek); // created during this week
        const leaf = openTabs[file.path]?.leaf ?? null;
        const active = openTabs[file.path]?.active ?? false;
        /** @type {THit} */
        const hit = {
          file: file,
          name: file.basename,
          path: file.path,
          date: file.stat.mtime,
          week: mweek,
          new: isNew,
          leaf: leaf,
          type: 'file',
          active: active,
        }
        return hit;
      })
      .sort((a, b) => b.date - a.date);

    /** @type {THits} */
    const groups = new Map();
    meta.total = hits.length;
    hits.forEach((hit) => {
      const hdr = getHeader(hit.week);
      if (!groups.has(hdr)) {
        groups.set(hdr, []);
      }
      groups.get(hdr).push(hit);
    });
    return { groups, meta };
    
    /* ⚒️ INTERNAL FUNCTIONS */

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
      let hidden = false
      if (patterns) {
        hidden = patterns.some((pattern) => {
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
            if (!this.hiddenFiles[pattern]) this.hiddenFiles[pattern] = '';
            if (valid) {
              this.hiddenFiles[pattern] += '  — ' + path + '\n';
            } else {
              this.hiddenFiles[pattern] = '  — ' + Lang.invalidRegex + '\n';
            }
          }
          return match;
        });
      }
      return hidden;
    }
  }

  getOpenTabs() {
    const openTabs = {};
    const activeId = this.app.workspace.getMostRecentLeaf().id;
    for (let leaf of this.app.workspace.getLeavesOfType('markdown')) {
      openTabs[leaf.view.getState().file] = {
        leaf: leaf,
        active: leaf.id === activeId,
      }
    }
    return openTabs;
  }
}

class LastMonthSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.hiddenPreview = undefined;
  }
  display() {
    const hiddenFiles = () => {
      let folders = '';
      Object.entries(this.plugin.view.hiddenFiles).forEach(([key, value]) => {
        folders += '▶ ' + key + ' ◀\n' + value + '\n';
      });
      return folders;
    }

    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('lmp-settings');

    new Setting(containerEl)
      .setName('Number of months')
      .setDesc(
        'Number of recent months to show'
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(Lang.monthOptions)
          .setValue(this.plugin.settings.countMonths)
          .onChange(async (value) => {
            this.plugin.settings.countMonths = value;
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
          .addOptions(Lang.openTypeOptions)
          .setValue(this.plugin.settings.openType)
          .onChange(async (value) => {
            this.plugin.settings.openType = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Rainbow headers')
      .setDesc('Alternate header colors between the default theme base colours')
      .addToggle((tog) => {
        tog
          .setValue(this.plugin.settings.rainbowHeaders)
          .onChange(async (value) => {
            this.plugin.settings.rainbowHeaders = value;
            await this.plugin.saveSettings();
            this.plugin.view.updateView();
          });
      })

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
            this.hiddenPreview.setValue(hiddenFiles());
          }, 1000, true));
      });

      
    new Setting(containerEl)
      .setName('Preview of hidden files or folders')
      .setDesc('For checking purposes.\u{000A}A list of all the hidden folders matched by the above regular expressions.\u{000A}Also shows invalid expressions so that you can correct them.')
      .addTextArea((text) => {
        text.setValue(hiddenFiles());
        this.hiddenPreview = text;  // hold a class ref for updates
        text.inputEl.setCssProps({ height: "20em"});
      });
  }
}


module.exports = {
  default: LastMonthPlugin,
}