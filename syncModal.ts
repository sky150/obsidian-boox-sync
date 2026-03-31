/**
 * syncModal.ts
 * Shows a modal with checkboxes for new/changed notes.
 * User selects which ones to sync, then clicks "Sync Selected".
 */

import { App, Modal, Setting, Notice } from "obsidian";
import { BooxFile } from "./booxClient";

export interface SyncCandidate extends BooxFile {
  status: "new" | "changed";
  selected: boolean;
}

export type SyncCallback = (selected: SyncCandidate[]) => Promise<void>;

export class SyncModal extends Modal {
  private candidates: SyncCandidate[];
  private onSync: SyncCallback;
  private isSyncing = false;

  constructor(app: App, candidates: SyncCandidate[], onSync: SyncCallback) {
    super(app);
    this.candidates = candidates;
    this.onSync = onSync;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Title
    contentEl.createEl("h2", { text: "Boox Notes Sync" });

    // Summary line
    const newCount = this.candidates.filter((c) => c.status === "new").length;
    const changedCount = this.candidates.filter(
      (c) => c.status === "changed",
    ).length;

    if (this.candidates.length === 0) {
      contentEl.createEl("p", {
        text: "✓ Everything is up to date. No new or changed notes found.",
        cls: "boox-sync-empty",
      });
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText("Close").onClick(() => this.close()),
      );
      return;
    }

    contentEl.createEl("p", {
      text: `Found ${newCount} new and ${changedCount} changed note(s) on your Boox device.`,
      cls: "boox-sync-summary",
    });

    // Select all / deselect all
    new Setting(contentEl)
      .setName("Selection")
      .addButton((btn) =>
        btn.setButtonText("Select All").onClick(() => {
          this.candidates.forEach((c) => (c.selected = true));
          this.refresh();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Deselect All").onClick(() => {
          this.candidates.forEach((c) => (c.selected = false));
          this.refresh();
        }),
      );

    // Divider
    contentEl.createEl("hr");

    // New notes section
    const newNotes = this.candidates.filter((c) => c.status === "new");
    if (newNotes.length > 0) {
      contentEl.createEl("h3", { text: `🆕 New (${newNotes.length})` });
      this.renderCandidateList(contentEl, newNotes);
    }

    // Changed notes section
    const changedNotes = this.candidates.filter((c) => c.status === "changed");
    if (changedNotes.length > 0) {
      contentEl.createEl("h3", { text: `✏️ Changed (${changedNotes.length})` });
      this.renderCandidateList(contentEl, changedNotes);
    }

    contentEl.createEl("hr");

    // Sync button
    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText(`Sync Selected`)
        .setCta()
        .onClick(async () => {
          if (this.isSyncing) return;
          const selected = this.candidates.filter((c) => c.selected);
          if (selected.length === 0) {
            new Notice("No notes selected.");
            return;
          }
          this.isSyncing = true;
          btn.setButtonText("Syncing...").setDisabled(true);
          try {
            await this.onSync(selected);
            this.close();
          } catch (e) {
            new Notice(`Sync failed: ${e.message}`);
            btn.setButtonText("Retry").setDisabled(false);
            this.isSyncing = false;
          }
        });
    });
  }

  private renderCandidateList(container: HTMLElement, notes: SyncCandidate[]) {
    for (const candidate of notes) {
      const setting = new Setting(container)
        .setName(candidate.name)
        .setDesc(this.formatMeta(candidate))
        .addToggle((toggle) => {
          toggle.setValue(candidate.selected).onChange((val) => {
            candidate.selected = val;
          });
        });
      setting.settingEl.addClass("boox-sync-item");
    }
  }

  private formatMeta(f: SyncCandidate): string {
    const date = new Date(f.updatedAt).toLocaleString();
    const kb = Math.round(f.size / 1024);
    return `${kb} KB · Last modified: ${date}`;
  }

  private refresh() {
    this.onOpen();
  }

  onClose() {
    this.contentEl.empty();
  }
}
