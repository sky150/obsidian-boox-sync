/**
 * syncModal.ts
 * Shows a modal with checkboxes for new/changed notes.
 */

import { App, Modal, Setting, Notice } from "obsidian";
import { BooxFile } from "./booxClient";

export interface SyncCandidate extends BooxFile {
  status: "new" | "changed";
  selected: boolean;
}

export type SyncCallback = (selected: SyncCandidate[]) => Promise<void>;

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export class SyncModal extends Modal {
  private candidates: SyncCandidate[];
  private onSync: SyncCallback;
  private isSyncing = false;
  private checkboxes: HTMLInputElement[] = [];

  constructor(app: App, candidates: SyncCandidate[], onSync: SyncCallback) {
    super(app);
    this.candidates = candidates;
    this.onSync = onSync;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("boox-modal");
    this.checkboxes = [];

    contentEl.createEl("h2", { text: "Boox Notes Sync" });

    const newCount = this.candidates.filter((c) => c.status === "new").length;
    const changedCount = this.candidates.filter(
      (c) => c.status === "changed",
    ).length;

    if (this.candidates.length === 0) {
      contentEl.createEl("p", {
        text: "Everything is up to date. No new or changed notes found.",
        cls: "boox-summary",
      });
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText("Close").onClick(() => this.close()),
      );
      return;
    }

    contentEl.createEl("p", {
      text: `Found ${newCount} new and ${changedCount} changed note(s) on your Boox device.`,
      cls: "boox-summary",
    });

    const actions = contentEl.createEl("div", { cls: "boox-actions" });
    const selectAllBtn = actions.createEl("button", { text: "Select All" });
    const deselectAllBtn = actions.createEl("button", { text: "Deselect All" });

    selectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => (c.selected = true));
      this.checkboxes.forEach((cb) => (cb.checked = true));
    });
    deselectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => (c.selected = false));
      this.checkboxes.forEach((cb) => (cb.checked = false));
    });

    const list = contentEl.createEl("div", { cls: "boox-list" });
    for (const candidate of this.candidates) {
      this.renderItem(list, candidate);
    }

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Sync Selected")
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
            new Notice(`Sync failed: ${getErrorMessage(e)}`);
            btn.setButtonText("Retry").setDisabled(false);
            this.isSyncing = false;
          }
        });
    });
  }

  private renderItem(list: HTMLElement, candidate: SyncCandidate) {
    const row = list.createEl("div", { cls: "boox-item" });

    const checkbox = row.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = candidate.selected;
    this.checkboxes.push(checkbox);

    checkbox.addEventListener("change", () => {
      candidate.selected = checkbox.checked;
    });

    const body = row.createEl("div", { cls: "boox-item-body" });

    const top = body.createEl("div", { cls: "boox-item-top" });
    top.createEl("span", {
      text: candidate.status,
      cls: `boox-badge boox-badge-${candidate.status}`,
    });
    top.createEl("span", {
      text: candidate.name,
      cls: "boox-item-name",
    });

    body.createEl("div", {
      text: this.formatMeta(candidate),
      cls: "boox-item-meta",
    });

    row.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      candidate.selected = checkbox.checked;
    });
  }

  private formatMeta(f: SyncCandidate): string {
    const date = new Date(f.updatedAt).toLocaleString();
    const kb = Math.round(f.size / 1024);
    const folder = f.notebookFolder ? `${f.notebookFolder} · ` : "";
    return `${folder}${kb} KB · ${date}`;
  }

  override onClose() {
    this.contentEl.empty();
  }
}