/**
 * Performance Benchmark Test for LaunchBox and EmulationStation XML Imports
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "node:server";
import http from "node:http";
import { performance } from "node:perf_hooks";

// Mock netplay
vi.mock('../netplay', () => ({
  attachNetplayServer: vi.fn(),
  registerNetplayRoutes: vi.fn()
}));

import { registerRoutes } from "../routes/index";
import { storage } from "../storage";

let server: any;
let port: number;

beforeAll(async () => {
  const app = express();

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

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

async function rawPost(path: string, body: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const buf = Buffer.from(body, "utf8");
    const options = {
      hostname: "127.0.0.1",
      port: port,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "Content-Length": buf.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode || 500, body: json });
      });
    });

    req.on("error", (err) => {
      console.error(`RAW_POST_ERROR: ${err.message}`);
      resolve({ status: 500, body: null });
    });

    req.write(buf);
    req.end();
  });
}

describe("XML Import Performance Benchmark", () => {
  const NUM_ROMS = 300;
  const runId = Date.now();
  const createdIds: number[] = [];

  beforeAll(async () => {
    // Seed database with NUM_ROMS
    for (let i = 1; i <= NUM_ROMS; i++) {
      const created = await storage.createUploadedRom({
        title: `ImportPerfGame_${runId}_${i}`,
        system: "snes",
        slug: `snes_importperfgame_${runId}_${i}`,
        originalName: `ImportPerfGame_${runId}_${i}.sfc`,
        fileName: `snes_importperfgame_${runId}_${i}.sfc`,
        filePath: `/roms/snes/ImportPerfGame_${runId}_${i}.sfc`,
        size: 1024,
        mimeType: "application/octet-stream",
        createdAt: Date.now(),
      });
      createdIds.push(created.id);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await storage.deleteUploadedRom(id);
    }
  });

  it("benchmarks LaunchBox XML import", async () => {
    let xml = `<LaunchBox>\n`;
    for (let i = 1; i <= NUM_ROMS; i++) {
      xml += `  <Game>\n    <Title>ImportPerfGame_${runId}_${i}</Title>\n    <ApplicationPath>ImportPerfGame_${runId}_${i}.sfc</ApplicationPath>\n    <Developer>Dev ${i}</Developer>\n    <Publisher>Pub ${i}</Publisher>\n    <Genre>Action; Adventure</Genre>\n    <Notes>Overview notes for game ${i}</Notes>\n    <ReleaseDate>1995-01-01T00:00:00</ReleaseDate>\n    <StarRating>4.5</StarRating>\n    <PlayCount>10</PlayCount>\n  </Game>\n`;
    }
    xml += `</LaunchBox>`;

    const start = performance.now();
    const res = await rawPost("/api/import/launchbox", xml);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(NUM_ROMS);

    console.log(`\n========================================`);
    console.log(`[BENCHMARK] LaunchBox Import (${NUM_ROMS} games): ${duration.toFixed(2)} ms`);
    console.log(`========================================\n`);

    const rom = await storage.getUploadedRom(createdIds[0]);
    expect(rom?.developer).toBe("Dev 1");
    expect(rom?.publisher).toBe("Pub 1");
    expect(rom?.genre).toBe("Action");
    expect(rom?.scrapeStatus).toBe("matched");
  });

  it("benchmarks EmulationStation XML import", async () => {
    let xml = `<gameList>\n`;
    for (let i = 1; i <= NUM_ROMS; i++) {
      xml += `  <game>\n    <path>./ImportPerfGame_${runId}_${i}.sfc</path>\n    <name>ImportPerfGame_${runId}_${i}</name>\n    <desc>Description for game ${i}</desc>\n    <developer>Dev ${i}</developer>\n    <publisher>Pub ${i}</publisher>\n    <genre>Platformer</genre>\n    <releasedate>19980101T000000</releasedate>\n    <rating>0.8</rating>\n    <playcount>5</playcount>\n  </game>\n`;
    }
    xml += `</gameList>`;

    const start = performance.now();
    const res = await rawPost("/api/import/emulationstation", xml);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(NUM_ROMS);

    console.log(`\n========================================`);
    console.log(`[BENCHMARK] EmulationStation Import (${NUM_ROMS} games): ${duration.toFixed(2)} ms`);
    console.log(`========================================\n`);

    const rom = await storage.getUploadedRom(createdIds[0]);
    expect(rom?.developer).toBe("Dev 1");
    expect(rom?.publisher).toBe("Pub 1");
    expect(rom?.genre).toBe("Platformer");
    expect(rom?.scrapeStatus).toBe("matched");
  });
});
