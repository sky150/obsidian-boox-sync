/**
 * booxClient.ts
 * Pure HTTP client for the BooxDrop local API.
 * No Obsidian dependency — easy to test independently.
 */

export interface BooxFile {
  name: string;
  path: string;
  size: number;
  updatedAt: number;
  dir: boolean;
  notebookFolder?: string;
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

const REQUEST_TIMEOUT_MS = 30_000;

export class BooxClient {
  private baseUrl: string;

  constructor(ip: string, port: number = 8085) {
    this.baseUrl = `http://${ip}:${port}`;
  }

  async listDir(dir: string): Promise<BooxFile[]> {
    const allEntries: BooxFile[] = [];
    let offset = 0;
    const limit = 200;

    while (true) {
      const args = JSON.stringify({
        dir,
        limit,
        offset,
        sortBy: "CreationTime",
        sortOrder: "Desc",
        refresh: true,
      });

      const url = `${this.baseUrl}/api/storage?args=${encodeURIComponent(args)}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `BooxDrop API returned HTTP ${response.status} for directory "${dir}"`,
        );
      }

      const json: BooxStorageResponse = await response.json();
      if (!json.successful) {
        throw new Error(
          `BooxDrop API returned unsuccessful response (code ${json.code}) for directory "${dir}"`,
        );
      }

      const page = json.data.list;
      allEntries.push(...page);

      if (allEntries.length >= json.data.count || page.length < limit) {
        break;
      }

      offset += limit;
    }

    return allEntries;
  }

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

  async downloadFile(devicePath: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/api/storage/file?args=${encodeURIComponent(devicePath)}&sender=web`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download ${devicePath}: HTTP ${response.status}`,
      );
    }

    return response.arrayBuffer();
  }

  async isReachable(dir: string = "/storage/emulated/0"): Promise<boolean> {
    try {
      const args = JSON.stringify({
        dir,
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