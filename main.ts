/**
 * main.ts
 * Boox Sync — Obsidian Plugin
 * Syncs handwritten notes from Onyx Boox device to Obsidian vault via BooxDrop.
 */

import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";
import { BooxClient, BooxFile } from "./booxClient";
import { SyncCandidate, SyncModal } from "./syncModal";

interface BooxSyncSettings {
  booxIp: string;
  booxPort: number;
  booxSourceDir: string;
  vaultTargetDir: string;
  mirrorFolders: boolean;
}

const DEFAULT_SETTINGS: BooxSyncSettings = {
  booxIp: "",
  booxPort: 8085,
  booxSourceDir: "/storage/emulated/0/note",
  vaultTargetDir: "boox",
  mirrorFolders: true,
};

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isValidIp(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false;
  return ip.split(".").every((octet) => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default class BooxSyncPlugin extends Plugin {
  settings: BooxSyncSettings = { ...DEFAULT_SETTINGS };

  override async onload() {
    await this.loadSettings();

    this.addRibbonIcon("tablet-smartphone", "Sync Boox Notes", () => {
      void this.runSync();
    });

    this.addCommand({
      id: "sync-boox-notes",
      name: "Sync Boox Notes",
      callback: () => this.runSync(),
    });

    this.addSettingTab(new BooxSyncSettingTab(this.app, this));
  }

  override onunload() {}

  async runSync() {
    if (!this.settings.booxIp) {
      new Notice(
        "Boox Sync: Please set your Boox IP address in the plugin settings.",
      );
      return;
    }

    if (!isValidIp(this.settings.booxIp)) {
      new Notice(
        "Boox Sync: Invalid IP address. Please enter a valid IPv4 address (e.g. 192.168.1.45).",
      );
      return;
    }

    const client = new BooxClient(this.settings.booxIp, this.settings.booxPort);

    const notice = new Notice("Boox Sync: Connecting to device...", 0);
    const reachable = await client.isReachable(this.settings.booxSourceDir);
    notice.hide();

    if (!reachable) {
      new Notice(
        `Boox Sync: Cannot reach device at ${this.settings.booxIp}:${this.settings.booxPort}.\n` +
          "Make sure BooxDrop is active and you're on the same network.",
        8000,
      );
      return;
    }

    let deviceFiles: BooxFile[];
    try {
      const scanNotice = new Notice("Boox Sync: Scanning notes...", 0);
      deviceFiles = await client.listAllNotes(this.settings.booxSourceDir);
      scanNotice.hide();
    } catch (e) {
      new Notice(`Boox Sync: Failed to scan notes — ${getErrorMessage(e)}`, 6000);
      return;
    }

    if (deviceFiles.length === 0) {
      new Notice(
        `Boox Sync: No exported PDFs found under ${this.settings.booxSourceDir}.\n` +
          "Export your notes as PDF (Vector) from the Boox Notes app first.",
        8000,
      );
      return;
    }

    const candidates = await this.buildCandidates(deviceFiles);

    new SyncModal(this.app, candidates, async (selected) => {
      await this.downloadAndSave(client, selected);
    }).open();
  }

  private async buildCandidates(
    deviceFiles: BooxFile[],
  ): Promise<SyncCandidate[]> {
    const candidates: SyncCandidate[] = [];

    for (const file of deviceFiles) {
      const vaultPath = this.vaultPathFor(file);
      const existing = this.app.vault.getAbstractFileByPath(vaultPath);

      if (!existing) {
        candidates.push({ ...file, status: "new", selected: true });
      } else if (existing instanceof TFile) {
        if (file.updatedAt > existing.stat.mtime) {
          candidates.push({ ...file, status: "changed", selected: true });
        }
      }
    }

    return candidates;
  }

  private vaultPathFor(file: BooxFile): string {
    if (this.settings.mirrorFolders && file.notebookFolder) {
      return normalizePath(
        `${this.settings.vaultTargetDir}/${file.notebookFolder}/${file.name}`,
      );
    }
    return normalizePath(`${this.settings.vaultTargetDir}/${file.name}`);
  }

  private async downloadAndSave(client: BooxClient, selected: SyncCandidate[]) {
    await this.ensureFolder(this.settings.vaultTargetDir);

    let successCount = 0;
    const errors: string[] = [];
    const progressNotice = new Notice(`Boox Sync: 0/${selected.length}...`, 0);

    for (let i = 0; i < selected.length; i++) {
      const candidate = selected[i];
      try {
        const data = await client.downloadFile(candidate.path);
        const vaultPath = this.vaultPathFor(candidate);

        if (this.settings.mirrorFolders && candidate.notebookFolder) {
          await this.ensureFolder(
            `${this.settings.vaultTargetDir}/${candidate.notebookFolder}`,
          );
        }

        const existing = this.app.vault.getAbstractFileByPath(vaultPath);
        if (existing instanceof TFile) {
          await this.app.vault.modifyBinary(existing, data);
        } else {
          await this.app.vault.createBinary(vaultPath, data);
        }

        successCount++;
      } catch (e) {
        errors.push(`${candidate.name}: ${getErrorMessage(e)}`);
      }

      progressNotice.setMessage(
        `Boox Sync: ${i + 1}/${selected.length}...`,
      );
    }

    progressNotice.hide();

    if (errors.length === 0) {
      new Notice(
        `Boox Sync: Synced ${successCount} note(s) to /${this.settings.vaultTargetDir}`,
      );
    } else {
      new Notice(
        `Boox Sync: Synced ${successCount}/${selected.length} notes.\nErrors:\n${errors.join("\n")}`,
        10000,
      );
    }

    this.app.workspace.trigger("resize");
  }

  private async ensureFolder(folderPath: string) {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch (e) {
        if (!getErrorMessage(e).includes("already exists")) {
          throw e;
        }
      }
    }
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<BooxSyncSettings>;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class BooxSyncSettingTab extends PluginSettingTab {
  plugin: BooxSyncPlugin;

  constructor(app: App, plugin: BooxSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): { name: string; id: string; description: string }[] {
    return [
      { name: "Boox Device IP", id: "booxIp", description: "The IPv4 address shown in the BooxDrop app" },
      { name: "BooxDrop Port", id: "booxPort", description: "Port used by BooxDrop (default 8085)" },
      { name: "Notes Root Folder on Device", id: "booxSourceDir", description: "Root path of the Notes app on your Boox" },
      { name: "Vault Target Folder", id: "vaultTargetDir", description: "Folder inside your vault where notes are saved" },
      { name: "Mirror Notebook Folders", id: "mirrorFolders", description: "Preserve notebook folder structure in the vault" },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Setup").setHeading();
    containerEl.createEl("p", {
      text: "Make sure BooxDrop is enabled on your device and both devices are on the same WiFi network.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Boox Device IP")
      .setDesc(
        "The IPv4 address shown in the BooxDrop app on your device (e.g. 192.168.1.45).",
      )
      .addText((text) =>
        text
          .setPlaceholder("192.168.1.45")
          .setValue(this.plugin.settings.booxIp)
          .onChange(async (value) => {
            this.plugin.settings.booxIp = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("BooxDrop Port")
      .setDesc(
        "Default is 8085. Only change if your device shows a different port.",
      )
      .addText((text) =>
        text
          .setPlaceholder("8085")
          .setValue(String(this.plugin.settings.booxPort))
          .onChange(async (value) => {
            const port = parseInt(value.trim(), 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.booxPort = port;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Notes Root Folder on Device")
      .setDesc(
        "Root path of the Notes app on your Boox. Only change if your firmware differs.",
      )
      .addText((text) =>
        text
          .setPlaceholder("/storage/emulated/0/note")
          .setValue(this.plugin.settings.booxSourceDir)
          .onChange(async (value) => {
            this.plugin.settings.booxSourceDir = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Vault Target Folder")
      .setDesc(
        "Folder inside your Obsidian vault where notes will be saved. Will be created if it doesn't exist.",
      )
      .addText((text) =>
        text
          .setPlaceholder("boox")
          .setValue(this.plugin.settings.vaultTargetDir)
          .onChange(async (value) => {
            this.plugin.settings.vaultTargetDir = value
              .trim()
              .replace(/^\/|\/$/g, "");
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Mirror Notebook Folders")
      .setDesc(
        "If enabled, notes keep their notebook folder structure in the vault. " +
          "E.g. a note in 'Meetings' on Boox → boox/Meetings/note.pdf. " +
          "If disabled, all notes go flat into the target folder.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mirrorFolders)
          .onChange(async (value) => {
            this.plugin.settings.mirrorFolders = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Connection").setHeading();
    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Check if your Boox device is reachable on the current network.")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          if (!this.plugin.settings.booxIp) {
            new Notice("Please enter a device IP first.");
            return;
          }
          if (!isValidIp(this.plugin.settings.booxIp)) {
            new Notice("Invalid IP address format.");
            return;
          }
          btn.setButtonText("Testing...").setDisabled(true);
          const client = new BooxClient(
            this.plugin.settings.booxIp,
            this.plugin.settings.booxPort,
          );
          const ok = await client.isReachable(this.plugin.settings.booxSourceDir);
          btn.setButtonText("Test").setDisabled(false);
          new Notice(
            ok
              ? `Connected to ${this.plugin.settings.booxIp}:${this.plugin.settings.booxPort}`
              : `Cannot reach device. Is BooxDrop active?`,
            5000,
          );
        }),
      );

    new Setting(containerEl).setName("How to use").setHeading();
    const steps = containerEl.createEl("ol");
    [
      "On your Boox export a note (Format: PDF or PNG).",
      "The exported PDF can be anywhere inside the storage, since all folders are scanned automatically.",
      "Make sure BooxDrop is active on your Boox device (swipe down → click on BOOXDrop).",
      'Run "Sync Boox Notes" from the Command Palette.',
      "Select which notes to sync in the dialog and click Sync Selected.",
    ].forEach((step) => steps.createEl("li", { text: step }));
  }
}