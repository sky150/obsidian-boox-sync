/**
 * booxClient.ts
 * Pure HTTP client for the BooxDrop local API.
 * No Obsidian dependency — easy to test independently.
 */

export interface BooxFile {
  name: string;
  path: string; // absolute path on device e.g. /storage/emulated/0/note/MyFolder/MyNote.pdf
  size: number;
  updatedAt: number; // unix timestamp in ms
  dir: boolean;
  notebookFolder?: string; // human-readable subfolder name, e.g. "MyFolder"
}

export interface BooxStorageResponse {
  code: number;
  successful: boolean;
  data: {
    count: number;
    fileCount: number;
    folderCount: number;
    list: BooxFile[];
  };
}

export class BooxClient {
  private baseUrl: string;

  constructor(ip: string, port: number = 8085) {
    this.baseUrl = `http://${ip}:${port}`;
  }

  /**
   * List contents of a single directory (files + subdirs).
   * Internal helper used by listAllNotes.
   */
  private async listDir(dir: string): Promise<BooxFile[]> {
    const args = JSON.stringify({
      dir,
      limit: 200,
      offset: 0,
      sortBy: "CreationTime",
      sortOrder: "Desc",
      refresh: true,
    });

    const url = `${this.baseUrl}/api/storage?args=${encodeURIComponent(args)}`;
    const response = await fetch(url);

    if (!response.ok) return [];

    const json: BooxStorageResponse = await response.json();
    if (!json.successful) return [];

    return json.data.list;
  }

  /**
   * Recursively find all exported PDFs under the notes root.
   * True DFS — goes into every subfolder no matter how deep.
   * notebookFolder tracks the full relative path, e.g. "Work/Meetings/Q1"
   */
  async listAllNotes(notesRoot: string): Promise<BooxFile[]> {
    const allPdfs: BooxFile[] = [];
    await this.traverseDir(notesRoot, "", allPdfs);
    return allPdfs;
  }

  private async traverseDir(
    absoluteDir: string,
    relativePath: string,
    accumulator: BooxFile[],
  ): Promise<void> {
    const entries = await this.listDir(absoluteDir);

    for (const entry of entries) {
      // Build absolute path ourselves — don't rely on entry.path for dirs
      const entryAbsPath = absoluteDir + "/" + entry.name;

      if (entry.dir) {
        const childRelative = relativePath
          ? relativePath + "/" + entry.name
          : entry.name;
        await this.traverseDir(entryAbsPath, childRelative, accumulator);
      } else if (/\.(pdf|png)$/i.test(entry.name)) {
        accumulator.push({
          ...entry,
          path: entry.path || entryAbsPath,
          notebookFolder: relativePath,
        });
      }
    }
  }

  /**
   * Download a file from the Boox device.
   * Returns an ArrayBuffer of the raw file bytes.
   */
  async downloadFile(devicePath: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/api/storage/file?args=${encodeURIComponent(devicePath)}&sender=web`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download ${devicePath}: HTTP ${response.status}`,
      );
    }

    return response.arrayBuffer();
  }

  /**
   * Quick connectivity check — tries to list the root storage.
   * Returns true if device is reachable, false otherwise.
   */
  async isReachable(): Promise<boolean> {
    try {
      const args = JSON.stringify({
        dir: "/storage/emulated/0",
        limit: 1,
        offset: 0,
        sortBy: "CreationTime",
        sortOrder: "Desc",
        refresh: false,
      });
      const url = `${this.baseUrl}/api/storage?args=${encodeURIComponent(args)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}
