import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import http from "node:http";
import { registerSystemRoutes } from "../routes/system";

let server: Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  registerSystemRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  server = httpServer;
  const addr = httpServer.address() as { port: number };
  port = addr.port;
}, 20_000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function apiGet(path: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const options = {
      hostname: "127.0.0.1",
      port: port,
      path: path,
      method: "GET",
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

    req.on("error", () => {
      resolve({ status: 500, body: null });
    });

    req.end();
  });
}

describe("GET /api/system route & benchmark", () => {
  it("returns system info with expected structure", async () => {
    const { status, body } = await apiGet("/api/system");
    expect(status).toBe(200);
    expect(body).toHaveProperty("arch");
    expect(body).toHaveProperty("platform");
    expect(body).toHaveProperty("cpuModel");
    expect(body).toHaveProperty("cores");
    expect(body.platform).toBe(process.platform);
  });

  it("benchmarks 500 sequential requests to GET /api/system", async () => {
    const ITERATIONS = 500;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const { status } = await apiGet("/api/system");
      expect(status).toBe(200);
    }
    const duration = performance.now() - start;
    console.log(`[Baseline Benchmark] ${ITERATIONS} requests took ${duration.toFixed(2)}ms (${(duration / ITERATIONS).toFixed(4)}ms/req)`);
  });
});
