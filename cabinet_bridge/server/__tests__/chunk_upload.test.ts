import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

const TEST_DATA_DIR = path.join("/tmp", "chunk-upload-test-" + Date.now());
if (!fs.existsSync(TEST_DATA_DIR)) {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}
process.env.CABINET_DATA_DIR = TEST_DATA_DIR;
process.env.NODE_ENV = "test";

// Mock scrape to prevent external network calls
vi.mock("../routes/scrape", () => ({
  findLibretroBoxArt: vi.fn().mockResolvedValue({ url: null, message: "No art in test" }),
}));

import { initializeDatabase } from "../storage";
import { registerRomRoutes } from "../routes/roms";
import { dataPath } from "../data-dir";

describe("Chunked Upload API — Init, Chunks, Sequential Assembly & Cancel", () => {
  let app: express.Express;

  beforeEach(() => {
    initializeDatabase();
    app = express();
    registerRomRoutes(app);
  });

  afterEach(() => {
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {}
  });

  function executeRequest(
    method: string,
    urlPath: string,
    headers: Record<string, string> = {},
    bodyData?: Buffer | object,
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve) => {
      let resolved = false;
      const resDataChunks: Buffer[] = [];
      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};

      const socket = new net.Socket();
      const req = new http.IncomingMessage(socket) as any;

      req.method = method;
      req.url = urlPath;
      req.headers = { ...headers };

      if (bodyData && !Buffer.isBuffer(bodyData)) {
        const jsonStr = JSON.stringify(bodyData);
        req.headers["content-type"] = "application/json";
        req.headers["content-length"] = String(Buffer.byteLength(jsonStr));
        req.push(Buffer.from(jsonStr));
        req.push(null);
      } else if (Buffer.isBuffer(bodyData)) {
        req.headers["content-type"] = headers["content-type"] || "application/octet-stream";
        req.headers["content-length"] = String(bodyData.length);
        req.push(bodyData);
        req.push(null);
      } else {
        req.push(null);
      }

      const res: any = {
        statusCode: 200,
        status(code: number) {
          statusCode = code;
          return this;
        },
        setHeader(name: string, value: string) {
          responseHeaders[name.toLowerCase()] = value;
          return this;
        },
        getHeader(name: string) {
          return responseHeaders[name.toLowerCase()];
        },
        write(chunk: any) {
          if (chunk) resDataChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return true;
        },
        end(chunk: any) {
          if (chunk) resDataChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          if (!resolved) {
            resolved = true;
            const text = Buffer.concat(resDataChunks).toString("utf8");
            let parsedBody: any = text;
            try {
              parsedBody = JSON.parse(text);
            } catch {}
            resolve({ status: statusCode, body: parsedBody });
          }
        },
        json(obj: any) {
          this.setHeader("content-type", "application/json");
          return this.end(JSON.stringify(obj));
        },
        send(obj: any) {
          if (typeof obj === "object") return this.json(obj);
          return this.end(obj);
        },
      };

      app.handle(req, res, () => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 404, body: { message: "Not found" } });
        }
      });
    });
  }

  it("fails init if system is invalid or file extension not allowed", async () => {
    const res = await executeRequest("POST", "/api/roms/upload/init", {}, {
      fileName: "game.exe",
      fileSize: 1000,
      system: "snes",
      totalChunks: 1,
      chunkSize: 1000,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Unsupported file type");
  });

  it("initializes session and returns uploadId for valid ROM", async () => {
    const res = await executeRequest("POST", "/api/roms/upload/init", {}, {
      fileName: "Super Mario World.sfc",
      fileSize: 1024 * 1024,
      system: "snes",
      totalChunks: 2,
      chunkSize: 512 * 1024,
    });

    expect(res.status).toBe(200);
    expect(res.body.uploadId).toBeDefined();
    expect(res.body.totalChunks).toBe(2);
  });

  it("handles multi-chunk upload, assembles sequentially, computes hash, and creates DB record", async () => {
    // 1. Init
    const part1 = Buffer.from("CHUNK_DATA_PART_1_AAAA_");
    const part2 = Buffer.from("CHUNK_DATA_PART_2_BBBB_");
    const fullContent = Buffer.concat([part1, part2]);
    const expectedHash = crypto.createHash("md5").update(fullContent).digest("hex");

    const initRes = await executeRequest("POST", "/api/roms/upload/init", {}, {
      fileName: "Chrono Trigger.sfc",
      fileSize: fullContent.length,
      system: "snes",
      favorite: true,
      totalChunks: 2,
      chunkSize: part1.length,
    });

    expect(initRes.status).toBe(200);
    const uploadId = initRes.body.uploadId;
    expect(uploadId).toBeDefined();

    // 2. Upload Chunk 0
    const chunk0Res = await executeRequest(
      "PUT",
      `/api/roms/upload/chunk?uploadId=${uploadId}&chunkIndex=0`,
      { "content-type": "application/octet-stream" },
      part1,
    );
    expect(chunk0Res.status).toBe(200);
    expect(chunk0Res.body.ok).toBe(true);
    expect(chunk0Res.body.receivedCount).toBe(1);

    // 3. Upload Chunk 1
    const chunk1Res = await executeRequest(
      "PUT",
      `/api/roms/upload/chunk?uploadId=${uploadId}&chunkIndex=1`,
      { "content-type": "application/octet-stream" },
      part2,
    );
    expect(chunk1Res.status).toBe(200);
    expect(chunk1Res.body.ok).toBe(true);
    expect(chunk1Res.body.receivedCount).toBe(2);

    // 4. Complete upload
    const completeRes = await executeRequest("POST", "/api/roms/upload/complete", {}, {
      uploadId,
    });

    expect(completeRes.status).toBe(201);
    expect(completeRes.body.title).toBe("Chrono Trigger");
    expect(completeRes.body.system).toBe("snes");
    expect(completeRes.body.romHash).toBe(expectedHash);
    expect(completeRes.body.size).toBe(fullContent.length);

    // Verify destination file exists and contains concatenated content
    const savedPath = completeRes.body.filePath;
    expect(fs.existsSync(savedPath)).toBe(true);
    const diskContent = fs.readFileSync(savedPath);
    expect(diskContent).toEqual(fullContent);

    // Verify staging directory was cleaned up
    const stagingDir = dataPath("upload-chunks", uploadId);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it("cancels an ongoing chunk session and cleans up disk artifacts", async () => {
    const initRes = await executeRequest("POST", "/api/roms/upload/init", {}, {
      fileName: "Metroid Prime.iso",
      fileSize: 10000,
      system: "ps1",
      totalChunks: 5,
      chunkSize: 2000,
    });
    const uploadId = initRes.body.uploadId;
    const stagingDir = dataPath("upload-chunks", uploadId);
    expect(fs.existsSync(stagingDir)).toBe(true);

    const cancelRes = await executeRequest("POST", "/api/roms/upload/cancel", {}, {
      uploadId,
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ok).toBe(true);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });
});
