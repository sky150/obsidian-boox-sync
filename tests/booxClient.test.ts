import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestUrl, RequestUrlResponse } from "obsidian";
import { BooxClient } from "../booxClient";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

describe("BooxClient", () => {
  let client: BooxClient;
  let requestUrlSpy = vi.mocked(requestUrl);

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BooxClient("192.168.1.1", 8085);
    requestUrlSpy = vi.mocked(requestUrl);
  });

  const makeResponse = (overrides: Partial<RequestUrlResponse> = {}) =>
    Promise.resolve({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: null,
      text: "",
      ...overrides,
    } as RequestUrlResponse);

  describe("isReachable", () => {
    it("returns true when device responds with ok", async () => {
      requestUrlSpy.mockReturnValue(makeResponse());
      await expect(client.isReachable()).resolves.toBe(true);
    });

    it("returns false on HTTP error", async () => {
      requestUrlSpy.mockReturnValue(makeResponse({ status: 500 }));
      await expect(client.isReachable()).resolves.toBe(false);
    });

    it("returns false on network error", async () => {
      requestUrlSpy.mockRejectedValue(new Error("Network error"));
      await expect(client.isReachable()).resolves.toBe(false);
    });

    it("uses provided directory when given", async () => {
      requestUrlSpy.mockReturnValue(makeResponse());
      await client.isReachable("/custom/path");
      const url = (requestUrlSpy.mock.calls[0][0] as { url: string }).url;
      const args = JSON.parse(
        decodeURIComponent(url.match(/args=([^&]+)/)![1]),
      );
      expect(args.dir).toBe("/custom/path");
    });

    it("defaults to /storage/emulated/0 when no dir given", async () => {
      requestUrlSpy.mockReturnValue(makeResponse());
      await client.isReachable();
      const url = (requestUrlSpy.mock.calls[0][0] as { url: string }).url;
      const args = JSON.parse(
        decodeURIComponent(url.match(/args=([^&]+)/)![1]),
      );
      expect(args.dir).toBe("/storage/emulated/0");
    });
  });

  describe("downloadFile", () => {
    const mockArrayBuffer = new ArrayBuffer(8);

    it("returns ArrayBuffer on success", async () => {
      requestUrlSpy.mockReturnValue(makeResponse({ arrayBuffer: mockArrayBuffer }));
      const result = await client.downloadFile("/path/to/file.pdf");
      expect(result).toBe(mockArrayBuffer);
    });

    it("throws on HTTP error", async () => {
      requestUrlSpy.mockReturnValue(makeResponse({ status: 404 }));
      await expect(
        client.downloadFile("/path/to/file.pdf"),
      ).rejects.toThrow("HTTP 404");
    });

    it("throws on network error", async () => {
      requestUrlSpy.mockRejectedValue(new Error("Connection refused"));
      await expect(
        client.downloadFile("/path/to/file.pdf"),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("listDir", () => {
  const mockResponse = (overrides: Partial<RequestUrlResponse> = {}) =>
    makeResponse({
      json: {
          code: 0,
          successful: true,
          data: {
            count: 2,
            fileCount: 2,
            folderCount: 0,
            list: [
              {
                name: "note1.pdf",
                path: "/notes/note1.pdf",
                size: 1024,
                updatedAt: 1000,
                dir: false,
              },
              {
                name: "note2.pdf",
                path: "/notes/note2.pdf",
                size: 2048,
                updatedAt: 2000,
                dir: false,
              },
            ],
          },
        },
        ...overrides,
      });

    it("returns file list on success", async () => {
      requestUrlSpy.mockReturnValue(mockResponse());
      const files = await client.listDir("/notes");
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe("note1.pdf");
    });

    it("handles pagination when results exceed page limit", async () => {
      const makePage = (files: any[], totalCount: number) =>
        makeResponse({
          json: {
            code: 0,
            successful: true,
            data: {
              count: totalCount,
              fileCount: files.length,
              folderCount: 0,
              list: files,
            },
          },
        });
      const page1Files = Array.from({ length: 200 }, (_, i) => ({
        name: `file${i + 1}.pdf`,
        path: `/notes/file${i + 1}.pdf`,
        size: 100,
        updatedAt: 100 + i,
        dir: false,
      }));
      const page2Files = [
        {
          name: "file201.pdf",
          path: "/notes/file201.pdf",
          size: 300,
          updatedAt: 300,
          dir: false,
        },
      ];
      requestUrlSpy
        .mockReturnValueOnce(
          makePage(page1Files, 201),
        )
        .mockReturnValueOnce(makePage(page2Files, 201));
      const files = await client.listDir("/notes");
      expect(files).toHaveLength(201);
      expect(requestUrlSpy).toHaveBeenCalledTimes(2);
    });

    it("throws on unsuccessful API response", async () => {
      requestUrlSpy.mockReturnValue(
        makeResponse({
          json: {
            code: 1,
            successful: false,
            data: { count: 0, fileCount: 0, folderCount: 0, list: [] },
          },
        }),
      );
      await expect(client.listDir("/notes")).rejects.toThrow("unsuccessful");
    });

    it("throws on HTTP error", async () => {
      requestUrlSpy.mockReturnValue(makeResponse({ status: 500 }));
      await expect(client.listDir("/notes")).rejects.toThrow("HTTP 500");
    });
  });
});
