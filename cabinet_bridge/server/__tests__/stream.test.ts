import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import http from "node:http";
import { registerStreamRoutes } from "../routes/stream";

describe("Native Stream & Co-Op Routes", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerStreamRoutes(app);

    const httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    server = httpServer;
    const addr = httpServer.address() as { port: number };
    port = addr.port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function api(method: string, path: string, body?: unknown) {
    return new Promise<{ status: number; body: any }>((resolve) => {
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(JSON.stringify(body)),
            }
          : {},
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 500, body: json });
        });
      });

      req.on("error", () => resolve({ status: 500, body: null }));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  it("POST /api/stream/start/invalid returns 400 for non-numeric ROM ID", async () => {
    const { status, body } = await api("POST", "/api/stream/start/abc");
    expect(status).toBe(400);
    expect(body?.message).toBe("Invalid ROM ID");
  });

  it("POST /api/stream/signal/:sessionId returns 400 when missing sdp or type", async () => {
    const { status, body } = await api("POST", "/api/stream/signal/fake-session", {});
    expect(status).toBe(400);
    expect(body?.message).toContain("Missing sdp or type");
  });

  it("POST /api/stream/join/:sessionId returns 404 for non-existent session", async () => {
    const { status, body } = await api("POST", "/api/stream/join/non-existent-session-id");
    expect(status).toBe(404);
    expect(body?.message).toBe("Cannot join session");
  });

  it("GET /api/stream/status/:sessionId returns 404 for non-existent session", async () => {
    const { status, body } = await api("GET", "/api/stream/status/non-existent-session-id");
    expect(status).toBe(404);
    expect(body?.message).toBe("Session not found");
  });

  it("GET /api/stream/peers/:sessionId returns empty peers when session not found or inactive", async () => {
    const { status, body } = await api("GET", "/api/stream/peers/non-existent-session-id");
    expect(status).toBe(200);
    expect(body?.count).toBe(0);
    expect(Array.isArray(body?.peers)).toBe(true);
  });

  it("renderStreamPlayerPage includes aligned SELECT/START, L/ZL & ZR/R shoulders, dual analog thumbsticks, and 7-byte WebRTC input packet", async () => {
    const { renderStreamPlayerPage } = await import("../routes/streamPlayer");
    const html = renderStreamPlayerPage({
      title: "Ape Escape",
      returnTo: "/",
      romId: 42,
      system: "ps1",
    });

    expect(html).toContain('id="v-shoulders-left"');
    expect(html).toContain('id="v-shoulders-right"');
    expect(html).toContain('id="v-btn-zl"');
    expect(html).toContain('id="v-btn-zr"');
    expect(html).toContain('id="v-stick-left"');
    expect(html).toContain('id="v-stick-right"');
    expect(html).toContain("new Uint8Array(7)");
    expect(html).toContain(".v-btn-pill {\n        position: relative;");
    expect(html).toContain("wasm-fallback-link");
  });

  it("renderStreamPlayerPage respects wasmMode setting", async () => {
    const { renderStreamPlayerPage } = await import("../routes/streamPlayer");
    const htmlDisabled = renderStreamPlayerPage({
      title: "Gran Turismo",
      returnTo: "/",
      romId: 99,
      system: "ps1",
      wasmMode: "disabled",
    });
    expect(htmlDisabled).not.toContain("wasm-fallback-link");

    const htmlFallback = renderStreamPlayerPage({
      title: "Gran Turismo",
      returnTo: "/",
      romId: 99,
      system: "ps1",
      wasmMode: "fallback",
    });
    expect(htmlFallback).toContain("wasm-fallback-link");
    expect(htmlFallback).toContain("const wasmAutoFallback = true;");
  });
});

