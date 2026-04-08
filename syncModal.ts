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

// Injected once into document.head — idempotent
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
    injectStyles();

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("boox-modal");

    contentEl.createEl("h2", { text: "Boox Notes Sync" });

    const newCount = this.candidates.filter((c) => c.status === "new").length;
    const changedCount = this.candidates.filter(
      (c) => c.status === "changed",
    ).length;

    // Empty state
    if (this.candidates.length === 0) {
      contentEl.createEl("p", {
        text: "✓ Everything is up to date. No new or changed notes found.",
        cls: "boox-summary",
      });
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText("Close").onClick(() => this.close()),
      );
      return;
    }

    // Summary
    contentEl.createEl("p", {
      text: `Found ${newCount} new and ${changedCount} changed note(s) on your Boox device.`,
      cls: "boox-summary",
    });

    // Select all / Deselect all
    const actions = contentEl.createEl("div", { cls: "boox-actions" });
    const selectAllBtn = actions.createEl("button", { text: "Select All" });
    const deselectAllBtn = actions.createEl("button", { text: "Deselect All" });

    selectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => (c.selected = true));
      this.refresh();
    });
    deselectAllBtn.addEventListener("click", () => {
      this.candidates.forEach((c) => (c.selected = false));
      this.refresh();
    });

    // Note list
    const list = contentEl.createEl("div", { cls: "boox-list" });
    for (const candidate of this.candidates) {
      this.renderItem(list, candidate);
    }

    // Sync button
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
            new Notice(`Sync failed: ${e.message}`);
            btn.setButtonText("Retry").setDisabled(false);
            this.isSyncing = false;
          }
        });
    });
  }

  private renderItem(list: HTMLElement, candidate: SyncCandidate) {
    const row = list.createEl("div", { cls: "boox-item" });

    const checkbox = row.createEl("input", { type: "checkbox" } as any);
    checkbox.checked = candidate.selected;
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

    // Click anywhere on the row (except checkbox) to toggle
    row.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      candidate.selected = checkbox.checked;
    });
  }

  private formatMeta(f: SyncCandidate): string {
    const date = new Date(f.updatedAt).toLocaleString();
    const kb = Math.round(f.size / 1024);
    const folder = f.notebookFolder ? `📁 ${f.notebookFolder} · ` : "";
    return `${folder}${kb} KB · ${date}`;
  }

  private refresh() {
    this.onOpen();
  }

  onClose() {
    this.contentEl.empty();
  }
}
