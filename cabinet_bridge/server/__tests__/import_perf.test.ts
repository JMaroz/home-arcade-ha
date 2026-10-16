import fs from "node:fs";

const TEST_DATA_DIR = "/tmp/cabinet-import-perf-" + Date.now();
if (!fs.existsSync(TEST_DATA_DIR)) {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

process.env.CABINET_DATA_DIR = TEST_DATA_DIR;
process.env.NODE_ENV = "test";

const { describe, it, expect, beforeAll, afterAll } = await import("vitest");
const express = (await import("express")).default;
const { createServer } = await import("node:http");
type Server = import("node:http").Server;
const http = (await import("node:http")).default;

const { registerImportRoutes } = await import("../routes/import");
const { initializeDatabase, db, storage } = await import("../storage");
const { uploadedRoms } = await import("@shared/schema");

let server: Server;
let port: number;

const NUM_ROMS = 1000;

beforeAll(async () => {
  initializeDatabase();
  const app = express();

  registerImportRoutes(app);

  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as { port: number };
  port = addr.port;

  db.delete(uploadedRoms).run();

  // Populate test database with NUM_ROMS records using a transaction
  db.transaction((tx: any) => {
    for (let i = 0; i < NUM_ROMS; i++) {
      tx.insert(uploadedRoms).values({
        title: `Super Game Title ${i}`,
        system: "snes",
        slug: `perf_test_snes_super_game_title_${i}_${Date.now()}`,
        originalName: `super_game_file_${i}.sfc`,
        fileName: `super_game_file_${i}.sfc`,
        filePath: `/roms/snes/super_game_file_${i}.sfc`,
        size: 1024 * 1024,
        mimeType: "application/octet-stream",
        createdAt: Date.now(),
      }).run();
    }
  });

  const inserted = await storage.listUploadedRoms();
  console.log(`Inserted ROMs in DB: ${inserted.length}`);
}, 20_000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

function sendXmlRequest(endpoint: string, xmlContent: string) {
  return new Promise<{ status: number; durationMs: number; body: any }>((resolve) => {
    const payload = Buffer.from(xmlContent, "utf8");
    const startTime = performance.now();

    const req = http.request({
      hostname: "127.0.0.1",
      port: port,
      path: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "Content-Length": payload.length,
      },
    }, (res) => {
      let responseText = "";
      res.on("data", (chunk) => { responseText += chunk; });
      res.on("end", () => {
        const durationMs = performance.now() - startTime;
        let json = null;
        try { json = JSON.parse(responseText); } catch {}
        resolve({ status: res.statusCode || 500, durationMs, body: json });
      });
    });

    req.on("error", (err) => {
      console.error(`Benchmark HTTP error: ${err.message}`);
      resolve({ status: 500, durationMs: 0, body: null });
    });

    req.write(payload);
    req.end();
  });
}

describe("Import Performance Benchmark", () => {
  it("EmulationStation XML import benchmark", async () => {
    // Generate EmulationStation XML with 1000 items
    let xml = `<gameList>\n`;
    for (let i = 0; i < NUM_ROMS; i++) {
      xml += `  <game>
    <path>./super_game_file_${i}.sfc</path>
    <name>Super Game Title ${i}</name>
    <desc>This is the detailed description for game number ${i} imported via EmulationStation.</desc>
    <developer>Developer Studio ${i % 10}</developer>
    <publisher>Publisher House ${i % 5}</publisher>
    <genre>Action RPG</genre>
    <releasedate>19950520T000000</releasedate>
    <rating>0.8</rating>
    <playcount>12</playcount>
  </game>\n`;
    }
    xml += `</gameList>`;

    const { status, durationMs, body } = await sendXmlRequest("/api/import/emulationstation", xml);
    console.log("ES results sample:", body.results?.[0]);
    expect(status).toBe(200);
    expect(body.imported).toBe(NUM_ROMS);

    console.log(`\n==================================================`);
    console.log(`📊 Benchmark Baseline: EmulationStation XML Import (${NUM_ROMS} ROMs)`);
    console.log(`⏱️ Duration: ${durationMs.toFixed(2)} ms`);
    console.log(`==================================================\n`);
  }, 30_000);

  it("LaunchBox XML import benchmark", async () => {
    // Generate LaunchBox XML with 1000 items
    let xml = `<LaunchBox>\n`;
    for (let i = 0; i < NUM_ROMS; i++) {
      xml += `  <Game>
    <Title>Super Game Title ${i}</Title>
    <ApplicationPath>super_game_file_${i}.sfc</ApplicationPath>
    <Notes>This is the detailed overview for game number ${i} imported via LaunchBox.</Notes>
    <Developer>Developer Studio ${i % 10}</Developer>
    <Publisher>Publisher House ${i % 5}</Publisher>
    <Genre>Action RPG</Genre>
    <ReleaseDate>1995-05-20T00:00:00</ReleaseDate>
    <StarRating>4.5</StarRating>
    <PlayCount>15</PlayCount>
  </Game>\n`;
    }
    xml += `</LaunchBox>`;

    const { status, durationMs, body } = await sendXmlRequest("/api/import/launchbox", xml);
    expect(status).toBe(200);
    expect(body.imported).toBe(NUM_ROMS);

    console.log(`\n==================================================`);
    console.log(`📊 Benchmark Baseline: LaunchBox XML Import (${NUM_ROMS} ROMs)`);
    console.log(`⏱️ Duration: ${durationMs.toFixed(2)} ms`);
    console.log(`==================================================\n`);
  }, 30_000);
});
