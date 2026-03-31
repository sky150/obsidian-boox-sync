/**
 * booxClient.ts
 * Pure HTTP client for the BooxDrop local API.
 * No Obsidian dependency — easy to test independently.
 */

export interface BooxFile {
  name: string;
  path: string; // absolute path on device e.g. /storage/emulated/0/note/obsidian-sync/MyNote.pdf
  size: number;
  updatedAt: number; // unix timestamp in ms
  dir: boolean;
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
   * List all files in a directory on the Boox device.
   * Uses /api/storage endpoint with dir param.
   */
  async listFiles(dir: string): Promise<BooxFile[]> {
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

    if (!response.ok) {
      throw new Error(`BooxDrop returned ${response.status} for dir: ${dir}`);
    }

    const json: BooxStorageResponse = await response.json();

    if (!json.successful) {
      throw new Error(`BooxDrop API error (code ${json.code}) for dir: ${dir}`);
    }

    // Return only files (not subdirectories), only PDFs
    return json.data.list.filter(
      (f) => !f.dir && f.name.toLowerCase().endsWith(".pdf"),
    );
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
