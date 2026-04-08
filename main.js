var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// booxClient.ts
var booxClient_exports = {};
__export(booxClient_exports, {
  BooxClient: () => BooxClient
});
var BooxClient;
var init_booxClient = __esm({
  "booxClient.ts"() {
    BooxClient = class {
      constructor(ip, port = 8085) {
        __publicField(this, "baseUrl");
        this.baseUrl = `http://${ip}:${port}`;
      }
      /**
       * List contents of a single directory (files + subdirs).
       * Internal helper used by listAllNotes.
       */
      async listDir(dir) {
        const args = JSON.stringify({
          dir,
          limit: 200,
          offset: 0,
          sortBy: "CreationTime",
          sortOrder: "Desc",
          refresh: true
        });
        const url = `${this.baseUrl}/api/storage?args=${encodeURIComponent(args)}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const json = await response.json();
        if (!json.successful) return [];
        return json.data.list;
      }
      /**
       * Recursively find all exported PDFs under the notes root.
       * True DFS — goes into every subfolder no matter how deep.
       * notebookFolder tracks the full relative path, e.g. "Work/Meetings/Q1"
       */
      async listAllNotes(notesRoot) {
        const allPdfs = [];
        await this.traverseDir(notesRoot, "", allPdfs);
        return allPdfs;
      }
      async traverseDir(absoluteDir, relativePath, accumulator) {
        const entries = await this.listDir(absoluteDir);
        for (const entry of entries) {
          const entryAbsPath = absoluteDir + "/" + entry.name;
          if (entry.dir) {
            const childRelative = relativePath ? relativePath + "/" + entry.name : entry.name;
            await this.traverseDir(entryAbsPath, childRelative, accumulator);
          } else if (/\.(pdf|png)$/i.test(entry.name)) {
            accumulator.push({
              ...entry,
              path: entry.path || entryAbsPath,
              notebookFolder: relativePath
            });
          }
        }
      }
      /**
       * Download a file from the Boox device.
       * Returns an ArrayBuffer of the raw file bytes.
       */
      async downloadFile(devicePath) {
        const url = `${this.baseUrl}/api/storage/file?args=${encodeURIComponent(devicePath)}&sender=web`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download ${devicePath}: HTTP ${response.status}`
          );
        }
        return response.arrayBuffer();
      }
      /**
       * Quick connectivity check — tries to list the root storage.
       * Returns true if device is reachable, false otherwise.
       */
      async isReachable() {
        try {
          const args = JSON.stringify({
            dir: "/storage/emulated/0",
            limit: 1,
            offset: 0,
            sortBy: "CreationTime",
            sortOrder: "Desc",
            refresh: false
          });
          const url = `${this.baseUrl}/api/storage?args=${encodeURIComponent(args)}`;
          const response = await fetch(url, { signal: AbortSignal.timeout(3e3) });
          return response.ok;
        } catch (e) {
          return false;
        }
      }
    };
  }
});

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BooxSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");
init_booxClient();

// syncModal.ts
var import_obsidian = require("obsidian");
function injectStyles() {
  const ID = "boox-sync-styles";
  if (document.getElementById(ID)) return;
  const el = document.createElement("style");
  el.id = ID;
  el.textContent = `
		.boox-modal { padding: 4px 0; }

		.boox-list {
			display: flex;
			flex-direction: column;
			gap: 0;
			margin: 8px 0;
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			overflow: hidden;
		}

		.boox-item {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 10px 14px;
			border-bottom: 1px solid var(--background-modifier-border);
			cursor: pointer;
			transition: background 0.1s;
		}

		.boox-item:last-child { border-bottom: none; }
		.boox-item:hover { background: var(--background-modifier-hover); }

		.boox-item input[type="checkbox"] {
			width: 16px;
			height: 16px;
			flex-shrink: 0;
			cursor: pointer;
			accent-color: var(--interactive-accent);
		}

		.boox-item-body {
			display: flex;
			flex-direction: column;
			gap: 3px;
			flex: 1;
			min-width: 0;
		}

		.boox-item-top {
			display: flex;
			align-items: center;
			gap: 7px;
		}

		.boox-badge {
			font-size: 10px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			padding: 1px 6px;
			border-radius: 3px;
			flex-shrink: 0;
		}

		.boox-badge-new {
			background: var(--color-green);
			color: #fff;
		}

		.boox-badge-changed {
			background: var(--color-orange);
			color: #fff;
		}

		.boox-item-name {
			font-size: var(--font-ui-small);
			font-weight: 500;
			color: var(--text-normal);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.boox-item-meta {
			font-size: var(--font-ui-smaller);
			color: var(--text-muted);
		}

		.boox-summary {
			font-size: var(--font-ui-small);
			color: var(--text-muted);
			margin: 0 0 12px 0;
		}

		.boox-actions {
			display: flex;
			gap: 6px;
			margin-bottom: 4px;
		}

		.boox-actions button {
			font-size: var(--font-ui-smaller);
			padding: 2px 10px;
			border-radius: 4px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			color: var(--text-muted);
			cursor: pointer;
		}

		.boox-actions button:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}
	`;
  document.head.appendChild(el);
}
var SyncModal = class extends import_obsidian.Modal {
  constructor(app, candidates, onSync) {
    super(app);
    __publicField(this, "candidates");
    __publicField(this, "onSync");
    __publicField(this, "isSyncing", false);
    this.candidates = candidates;
    this.onSync = onSync;
  }
  onOpen() {
    injectStyles();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("boox-modal");
    contentEl.createEl("h2", { text: "Boox Notes Sync" });
    const newCount = this.candidates.filter((c) => c.status === "new").length;
    const changedCount = this.candidates.filter(
      (c) => c.status === "changed"
    ).length;
    if (this.candidates.length === 0) {
      contentEl.createEl("p", {
        text: "\u2713 Everything is up to date. No new or changed notes found.",
        cls: "boox-summary"
      });
      new import_obsidian.Setting(contentEl).addButton(
        (btn) => btn.setButtonText("Close").onClick(() => this.close())
      );
      return;
    }
    contentEl.createEl("p", {
      text: `Found ${newCount} new and ${changedCount} changed note(s) on your Boox device.`,
      cls: "boox-summary"
    });
    const actions = contentEl.createEl("div", { cls: "boox-actions" });
    const selectAllBtn = actions.createEl("button", { text: "Select All" });
    const deselectAllBtn = actions.createEl("button", { text: "Deselect All" });
    selectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => c.selected = true);
      this.refresh();
    });
    deselectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => c.selected = false);
      this.refresh();
    });
    const list = contentEl.createEl("div", { cls: "boox-list" });
    for (const candidate of this.candidates) {
      this.renderItem(list, candidate);
    }
    new import_obsidian.Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Sync Selected").setCta().onClick(async () => {
        if (this.isSyncing) return;
        const selected = this.candidates.filter((c) => c.selected);
        if (selected.length === 0) {
          new import_obsidian.Notice("No notes selected.");
          return;
        }
        this.isSyncing = true;
        btn.setButtonText("Syncing...").setDisabled(true);
        try {
          await this.onSync(selected);
          this.close();
        } catch (e) {
          new import_obsidian.Notice(`Sync failed: ${e.message}`);
          btn.setButtonText("Retry").setDisabled(false);
          this.isSyncing = false;
        }
      });
    });
  }
  renderItem(list, candidate) {
    const row = list.createEl("div", { cls: "boox-item" });
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = candidate.selected;
    checkbox.addEventListener("change", () => {
      candidate.selected = checkbox.checked;
    });
    const body = row.createEl("div", { cls: "boox-item-body" });
    const top = body.createEl("div", { cls: "boox-item-top" });
    top.createEl("span", {
      text: candidate.status,
      cls: `boox-badge boox-badge-${candidate.status}`
    });
    top.createEl("span", {
      text: candidate.name,
      cls: "boox-item-name"
    });
    body.createEl("div", {
      text: this.formatMeta(candidate),
      cls: "boox-item-meta"
    });
    row.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      candidate.selected = checkbox.checked;
    });
  }
  formatMeta(f) {
    const date = new Date(f.updatedAt).toLocaleString();
    const kb = Math.round(f.size / 1024);
    const folder = f.notebookFolder ? `\u{1F4C1} ${f.notebookFolder} \xB7 ` : "";
    return `${folder}${kb} KB \xB7 ${date}`;
  }
  refresh() {
    this.onOpen();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  booxIp: "",
  booxPort: 8085,
  booxSourceDir: "/storage/emulated/0/note",
  vaultTargetDir: "boox",
  mirrorFolders: true
};
var BooxSyncPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings");
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("tablet-smartphone", "Sync Boox Notes", () => {
      this.runSync();
    });
    this.addCommand({
      id: "sync-boox-notes",
      name: "Sync Boox Notes",
      callback: () => this.runSync()
    });
    this.addSettingTab(new BooxSyncSettingTab(this.app, this));
  }
  onunload() {
  }
  // ─── Core sync flow ────────────────────────────────────────────────────────
  async runSync() {
    if (!this.settings.booxIp) {
      new import_obsidian2.Notice(
        "Boox Sync: Please set your Boox IP address in the plugin settings."
      );
      return;
    }
    const client = new BooxClient(this.settings.booxIp, this.settings.booxPort);
    const notice = new import_obsidian2.Notice("Boox Sync: Connecting to device...", 0);
    const reachable = await client.isReachable();
    notice.hide();
    if (!reachable) {
      new import_obsidian2.Notice(
        `Boox Sync: Cannot reach device at ${this.settings.booxIp}:${this.settings.booxPort}.
Make sure BooxDrop is active and you're on the same network.`,
        8e3
      );
      return;
    }
    let deviceFiles;
    try {
      const scanNotice = new import_obsidian2.Notice("Boox Sync: Scanning notes...", 0);
      deviceFiles = await client.listAllNotes(this.settings.booxSourceDir);
      scanNotice.hide();
    } catch (e) {
      new import_obsidian2.Notice(`Boox Sync: Failed to scan notes \u2014 ${e.message}`, 6e3);
      return;
    }
    if (deviceFiles.length === 0) {
      new import_obsidian2.Notice(
        `Boox Sync: No exported PDFs found under ${this.settings.booxSourceDir}.
Export your notes as PDF (Vector) from the Boox Notes app first.`,
        8e3
      );
      return;
    }
    const candidates = await this.buildCandidates(deviceFiles);
    new SyncModal(this.app, candidates, async (selected) => {
      await this.downloadAndSave(client, selected);
    }).open();
  }
  /**
   * For each file on the device, check if it exists in the vault.
   * Vault path mirrors the notebook folder structure if mirrorFolders is on:
   *   boox/FolderName/note.pdf
   * Otherwise flat:
   *   boox/note.pdf
   */
  async buildCandidates(deviceFiles) {
    const candidates = [];
    for (const file of deviceFiles) {
      const vaultPath = this.vaultPathFor(file);
      const existing = this.app.vault.getAbstractFileByPath(vaultPath);
      if (!existing) {
        candidates.push({ ...file, status: "new", selected: true });
      } else if (existing instanceof import_obsidian2.TFile) {
        if (file.updatedAt > existing.stat.mtime) {
          candidates.push({ ...file, status: "changed", selected: true });
        }
      }
    }
    return candidates;
  }
  vaultPathFor(file) {
    if (this.settings.mirrorFolders && file.notebookFolder) {
      return (0, import_obsidian2.normalizePath)(
        `${this.settings.vaultTargetDir}/${file.notebookFolder}/${file.name}`
      );
    }
    return (0, import_obsidian2.normalizePath)(`${this.settings.vaultTargetDir}/${file.name}`);
  }
  async downloadAndSave(client, selected) {
    await this.ensureFolder(this.settings.vaultTargetDir);
    let successCount = 0;
    const errors = [];
    for (const candidate of selected) {
      try {
        const data = await client.downloadFile(candidate.path);
        const vaultPath = this.vaultPathFor(candidate);
        if (this.settings.mirrorFolders && candidate.notebookFolder) {
          await this.ensureFolder(
            `${this.settings.vaultTargetDir}/${candidate.notebookFolder}`
          );
        }
        const existing = this.app.vault.getAbstractFileByPath(vaultPath);
        if (existing instanceof import_obsidian2.TFile) {
          await this.app.vault.modifyBinary(existing, data);
        } else {
          await this.app.vault.createBinary(vaultPath, data);
        }
        successCount++;
      } catch (e) {
        errors.push(`${candidate.name}: ${e.message}`);
      }
    }
    if (errors.length === 0) {
      new import_obsidian2.Notice(
        `Boox Sync: \u2713 Synced ${successCount} note(s) to /${this.settings.vaultTargetDir}`
      );
    } else {
      new import_obsidian2.Notice(
        `Boox Sync: Synced ${successCount}/${selected.length} notes.
Errors:
${errors.join("\n")}`,
        1e4
      );
    }
  }
  /**
   * Create a folder in the vault if it doesn't exist yet.
   */
  async ensureFolder(folderPath) {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  // ─── Settings persistence ──────────────────────────────────────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var BooxSyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Boox Sync Settings" });
    containerEl.createEl("p", {
      text: "Make sure BooxDrop is enabled on your device and both devices are on the same WiFi network.",
      cls: "setting-item-description"
    });
    new import_obsidian2.Setting(containerEl).setName("Boox Device IP").setDesc(
      "The IP address shown in the BooxDrop app on your device (e.g. 192.168.1.45)."
    ).addText(
      (text) => text.setPlaceholder("192.168.1.45").setValue(this.plugin.settings.booxIp).onChange(async (value) => {
        this.plugin.settings.booxIp = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("BooxDrop Port").setDesc(
      "Default is 8085. Only change if your device shows a different port."
    ).addText(
      (text) => text.setPlaceholder("8085").setValue(String(this.plugin.settings.booxPort)).onChange(async (value) => {
        const port = parseInt(value.trim(), 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          this.plugin.settings.booxPort = port;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Notes Root Folder on Device").setDesc(
      "Root path of the Notes app on your Boox. All subfolders are scanned recursively. Default is correct for most devices \u2014 only change if your firmware differs."
    ).addText(
      (text) => text.setPlaceholder("/storage/emulated/0/note").setValue(this.plugin.settings.booxSourceDir).onChange(async (value) => {
        this.plugin.settings.booxSourceDir = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Vault Target Folder").setDesc(
      "Folder inside your Obsidian vault where notes will be saved. Will be created if it doesn't exist."
    ).addText(
      (text) => text.setPlaceholder("boox").setValue(this.plugin.settings.vaultTargetDir).onChange(async (value) => {
        this.plugin.settings.vaultTargetDir = value.trim().replace(/^\/|\/$/g, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Mirror Notebook Folders").setDesc(
      "If enabled, notes keep their notebook folder structure in the vault. E.g. a note in 'Meetings' on Boox \u2192 boox/Meetings/note.pdf. If disabled, all notes go flat into the target folder."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.mirrorFolders).onChange(async (value) => {
        this.plugin.settings.mirrorFolders = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Connection" });
    new import_obsidian2.Setting(containerEl).setName("Test Connection").setDesc("Check if your Boox device is reachable on the current network.").addButton(
      (btn) => btn.setButtonText("Test").onClick(async () => {
        if (!this.plugin.settings.booxIp) {
          new import_obsidian2.Notice("Please enter a device IP first.");
          return;
        }
        btn.setButtonText("Testing...").setDisabled(true);
        const { BooxClient: BooxClient2 } = await Promise.resolve().then(() => (init_booxClient(), booxClient_exports));
        const client = new BooxClient2(
          this.plugin.settings.booxIp,
          this.plugin.settings.booxPort
        );
        const ok = await client.isReachable();
        btn.setButtonText("Test").setDisabled(false);
        new import_obsidian2.Notice(
          ok ? `\u2713 Connected to ${this.plugin.settings.booxIp}:${this.plugin.settings.booxPort}` : `\u2717 Cannot reach device. Is BooxDrop active?`,
          5e3
        );
      })
    );
    containerEl.createEl("h3", { text: "How to use" });
    const steps = containerEl.createEl("ol");
    [
      "On your Boox: open a note \u2192 top-right menu \u2192 Export \u2192 choose PDF (Vector).",
      "The exported PDF can be anywhere inside the Notes app \u2014 all folders are scanned automatically.",
      "Make sure BooxDrop is active on your Boox device (swipe down \u2192 transfer icon).",
      'Click the tablet icon in the Obsidian ribbon, or run "Sync Boox Notes" from the Command Palette.',
      "Select which notes to sync in the dialog and click Sync Selected."
    ].forEach((step) => steps.createEl("li", { text: step }));
  }
};
