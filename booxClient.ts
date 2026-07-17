/**
 * booxClient.ts
 * HTTP client for the BooxDrop local API.
 * Uses Obsidian's requestUrl helper so network requests work across all
 * Obsidian platforms and respect the recommended API.
 */

import { requestUrl, RequestUrlResponse } from "obsidian";

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

async function requestWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<RequestUrlResponse> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([requestUrl({ url, throw: false }), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

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
      const response = await requestWithTimeout(url, REQUEST_TIMEOUT_MS);

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `BooxDrop API returned HTTP ${response.status} for directory "${dir}"`,
        );
      }

      const json = response.json as BooxStorageResponse;
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
    const response = await requestWithTimeout(url, REQUEST_TIMEOUT_MS);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Failed to download ${devicePath}: HTTP ${response.status}`,
      );
    }

    return response.arrayBuffer;
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
      const response = await requestWithTimeout(url, 3000);
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }
}
