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

// ─── Settings ────────────────────────────────────────────────────────────────

interface BooxSyncSettings {
  booxIp: string;
  booxPort: number;
  booxSourceDir: string; // path on device, e.g. /storage/emulated/0/note/obsidian-sync
  vaultTargetDir: string; // folder in vault, e.g. boox
}

const DEFAULT_SETTINGS: BooxSyncSettings = {
  booxIp: "",
  booxPort: 8085,
  booxSourceDir: "/storage/emulated/0/note/obsidian-sync",
  vaultTargetDir: "boox",
};

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class BooxSyncPlugin extends Plugin {
  settings: BooxSyncSettings;

  async onload() {
    await this.loadSettings();

    // Ribbon icon (left sidebar)
    this.addRibbonIcon("tablet-smartphone", "Sync Boox Notes", () => {
      this.runSync();
    });

    // Command palette entry
    this.addCommand({
      id: "sync-boox-notes",
      name: "Sync Boox Notes",
      callback: () => this.runSync(),
    });

    // Settings tab
    this.addSettingTab(new BooxSyncSettingTab(this.app, this));
  }

  onunload() {}

  // ─── Core sync flow ────────────────────────────────────────────────────────

  async runSync() {
    // 1. Validate settings
    if (!this.settings.booxIp) {
      new Notice(
        "Boox Sync: Please set your Boox IP address in the plugin settings.",
      );
      return;
    }

    const client = new BooxClient(this.settings.booxIp, this.settings.booxPort);

    // 2. Check connectivity
    const notice = new Notice("Boox Sync: Connecting to device...", 0);
    const reachable = await client.isReachable();
    notice.hide();

    if (!reachable) {
      new Notice(
        `Boox Sync: Cannot reach device at ${this.settings.booxIp}:${this.settings.booxPort}.\n` +
          "Make sure BooxDrop is active and you're on the same network.",
        8000,
      );
      return;
    }

    // 3. Fetch file list from device
    let deviceFiles: BooxFile[];
    try {
      deviceFiles = await client.listFiles(this.settings.booxSourceDir);
    } catch (e) {
      new Notice(`Boox Sync: Failed to list files — ${e.message}`, 6000);
      return;
    }

    if (deviceFiles.length === 0) {
      new Notice(
        `Boox Sync: No PDF files found in ${this.settings.booxSourceDir}.\n` +
          "Export your notes to that folder on the device first.",
        8000,
      );
      return;
    }

    // 4. Compare with vault — determine new / changed
    const candidates = await this.buildCandidates(deviceFiles);

    // 5. Open modal for user to select which to sync
    new SyncModal(this.app, candidates, async (selected) => {
      await this.downloadAndSave(client, selected);
    }).open();
  }

  /**
   * For each file on the device, check if it exists in the vault.
   * Mark as "new" or "changed" accordingly.
   */
  private async buildCandidates(
    deviceFiles: BooxFile[],
  ): Promise<SyncCandidate[]> {
    const candidates: SyncCandidate[] = [];

    for (const file of deviceFiles) {
      const vaultPath = normalizePath(
        `${this.settings.vaultTargetDir}/${file.name}`,
      );
      const existing = this.app.vault.getAbstractFileByPath(vaultPath);

      if (!existing) {
        // File doesn't exist in vault → new
        candidates.push({ ...file, status: "new", selected: true });
      } else if (existing instanceof TFile) {
        // File exists — check if device version is newer
        const vaultModTime = existing.stat.mtime;
        if (file.updatedAt > vaultModTime) {
          candidates.push({ ...file, status: "changed", selected: true });
        }
        // If vault is same age or newer → skip entirely (already synced)
      }
    }

    return candidates;
  }

  /**
   * Download each selected file and write it to the vault.
   */
  private async downloadAndSave(client: BooxClient, selected: SyncCandidate[]) {
    // Ensure target folder exists
    await this.ensureFolder(this.settings.vaultTargetDir);

    let successCount = 0;
    const errors: string[] = [];

    for (const candidate of selected) {
      try {
        const data = await client.downloadFile(candidate.path);
        const vaultPath = normalizePath(
          `${this.settings.vaultTargetDir}/${candidate.name}`,
        );
        const existing = this.app.vault.getAbstractFileByPath(vaultPath);

        if (existing instanceof TFile) {
          // Overwrite existing file
          await this.app.vault.modifyBinary(existing, data);
        } else {
          // Create new file
          await this.app.vault.createBinary(vaultPath, data);
        }

        successCount++;
      } catch (e) {
        errors.push(`${candidate.name}: ${e.message}`);
      }
    }

    // Show result
    if (errors.length === 0) {
      new Notice(
        `Boox Sync: ✓ Synced ${successCount} note(s) to /${this.settings.vaultTargetDir}`,
      );
    } else {
      new Notice(
        `Boox Sync: Synced ${successCount}/${selected.length} notes.\n` +
          `Errors:\n${errors.join("\n")}`,
        10000,
      );
    }
  }

  /**
   * Create a folder in the vault if it doesn't exist yet.
   */
  private async ensureFolder(folderPath: string) {
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
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class BooxSyncSettingTab extends PluginSettingTab {
  plugin: BooxSyncPlugin;

  constructor(app: App, plugin: BooxSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Boox Sync Settings" });
    containerEl.createEl("p", {
      text: "Make sure BooxDrop is enabled on your device and both devices are on the same WiFi network.",
      cls: "setting-item-description",
    });

    // IP address
    new Setting(containerEl)
      .setName("Boox Device IP")
      .setDesc(
        "The IP address shown in the BooxDrop app on your device (e.g. 192.168.1.45).",
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

    // Port
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

    // Source folder on device
    new Setting(containerEl)
      .setName("Notes Folder on Device")
      .setDesc(
        "Absolute path to the folder on your Boox where you export notes. " +
          "Export your handwritten notes as PDF (Vector) to this folder.",
      )
      .addText((text) =>
        text
          .setPlaceholder("/storage/emulated/0/note/obsidian-sync")
          .setValue(this.plugin.settings.booxSourceDir)
          .onChange(async (value) => {
            this.plugin.settings.booxSourceDir = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    // Target folder in vault
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

    // Test connection button
    containerEl.createEl("h3", { text: "Connection" });
    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Check if your Boox device is reachable on the current network.")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          if (!this.plugin.settings.booxIp) {
            new Notice("Please enter a device IP first.");
            return;
          }
          btn.setButtonText("Testing...").setDisabled(true);
          const { BooxClient } = await import("./booxClient");
          const client = new BooxClient(
            this.plugin.settings.booxIp,
            this.plugin.settings.booxPort,
          );
          const ok = await client.isReachable();
          btn.setButtonText("Test").setDisabled(false);
          new Notice(
            ok
              ? `✓ Connected to ${this.plugin.settings.booxIp}:${this.plugin.settings.booxPort}`
              : `✗ Cannot reach device. Is BooxDrop active?`,
            5000,
          );
        }),
      );

    // Workflow hint
    containerEl.createEl("h3", { text: "How to use" });
    const steps = containerEl.createEl("ol");
    [
      "On your Boox: open a note → top-right menu → Export → choose PDF (Vector).",
      `Save the exported PDF to the folder you configured above (default: note/obsidian-sync/).`,
      "On your PC: make sure BooxDrop is active on the device.",
      'Click the tablet icon in the Obsidian ribbon, or run the "Sync Boox Notes" command.',
      "Select which notes to sync in the dialog and click Sync Selected.",
    ].forEach((step) => steps.createEl("li", { text: step }));
  }
}
