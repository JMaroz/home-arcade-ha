import { describe, it, expect } from "vitest";
import { EMULATORJS_CORES } from "../routes/shared";
import { REQUIRED_BIOS } from "../../shared/bios-metadata";

describe("Core Health & BIOS Validation", () => {
  const systems = [
    "nes", "snes", "n64", "gba", "genesis", "ps1", "ps2", 
    "arcade", "dreamcast", "gb", "gbc", "nds", "psp", 
    "atari2600", "saturn", "gamegear", "sms", "pce", 
    "sega32x", "segacd", "neogeo", "virtualboy", "atari7800", "lynx"
  ];

  it("should have a valid core mapping for every supported system", () => {
    systems.forEach(system => {
      const core = EMULATORJS_CORES[system];
      expect(core, `System '${system}' is missing a core mapping in shared.ts`).toBeDefined();
      expect(typeof core).toBe("string");
    });
  });

  it("should have correct BIOS keys matching core names", () => {
    // Systems that definitely MUST have BIOS metadata defined (even if files are optional)
    const coresRequiringMetadata = ["pcsx_rearmed", "play", "flycast", "mgba", "saturn", "segacd"];
    
    coresRequiringMetadata.forEach(core => {
      // Find the key in REQUIRED_BIOS that matches this core
      const metadata = REQUIRED_BIOS[core];
      expect(metadata, `Core '${core}' is used but missing from REQUIRED_BIOS keys`).toBeDefined();
    });
  });

  it("should correctly handle conditional Sega BIOS logic", () => {
    const genesisCore = EMULATORJS_CORES["genesis"];
    const segacdCore = EMULATORJS_CORES["segacd"];
    
    expect(genesisCore).toBe("segaMD");
    expect(segacdCore).toBe("segacd");
    
    // The BIOS metadata should exist for Sega CD
    expect(REQUIRED_BIOS["segacd"]).toBeDefined();
  });

  it("should use standard naming for NES and Arcade to ensure playback", () => {
    expect(EMULATORJS_CORES["nes"]).toBe("nes");
    expect(EMULATORJS_CORES["arcade"]).toBe("fbneo");
  });

  it("should use stable naming for handheld systems", () => {
    expect(EMULATORJS_CORES["gb"]).toBe("gb");
    expect(EMULATORJS_CORES["gbc"]).toBe("gbc");
    expect(EMULATORJS_CORES["gba"]).toBe("mgba");
    expect(EMULATORJS_CORES["psp"]).toBe("ppsspp");
    expect(REQUIRED_BIOS["psp"]).toBeUndefined();
  });

  it("should use the 'play' core for PS2 to match BIOS and core files", () => {
    expect(EMULATORJS_CORES["ps2"]).toBe("play");
    expect(REQUIRED_BIOS["play"]).toBeDefined();
    for (const coreKey of ["play", "pcsx2", "ps2"]) {
      const biosList = REQUIRED_BIOS[coreKey];
      expect(biosList).toBeDefined();
      const scph70004 = biosList.find((b) => b.filename === "scph70004.bin");
      expect(scph70004).toBeDefined();
      expect(scph70004?.md5).toBe("dc752f160044f2ed5fc1f4964db2a095");
      expect(scph70004?.sourceUrl).toContain("SCPH-70004.BIN");
    }
  });

  it("should use the verified 'n64' alias to ensure cross-device playback", () => {
    // We use the generic 'n64' alias because explicitly forcing 'mupen64plus_next'
    // can break loading on mobile/Safari where the WASM files are named differently.
    expect(EMULATORJS_CORES["n64"]).toBe("n64");
    
    // N64 should NOT have a BIOS requirement that blocks loading in the standard gate
    expect(REQUIRED_BIOS["n64"]).toBeUndefined();
  });
});

describe("Bootstrap Script Syntax Validation", () => {
  it("should compile generated bootstrap JS code without syntax errors", async () => {
    const { renderEmulatorBootstrap } = await import("../routes/player");
    const { Script } = await import("node:vm");
    
    const code = renderEmulatorBootstrap({
      core: "nes",
      title: "Test Game",
      gameId: "nes-test-game",
      romId: 123,
      discs: [],
      romHash: "some-hash",
      userId: "test-user",
      userName: "Test User",
      profileId: "1",
      biosUrl: null,
      netplayRole: null,
      netplayRoom: null,
      netplaySyncMode: "rollback",
      controlDefaults: {},
      gamepadBindings: {},
      controlDefaultsP2: {},
      gamepadBindingsP2: {}
    });
    
    // vm.Script will compile the code and throw a SyntaxError if it's invalid.
    expect(() => new Script(code)).not.toThrow();
  });

  it("should configure EJS_threads and N64 performance options in bootstrap", async () => {
    const { renderEmulatorBootstrap } = await import("../routes/player");
    const { Script } = await import("node:vm");

    const n64Code = renderEmulatorBootstrap({
      core: "n64",
      title: "007 - The World Is Not Enough",
      gameId: "n64-007-twine",
      romId: 456,
      discs: [],
      romHash: "twine-hash",
      userId: "test-user",
      userName: "Agent 007",
      profileId: "1",
      biosUrl: null,
      netplayRole: null,
      netplayRoom: null,
      netplaySyncMode: "rollback",
      controlDefaults: {},
      gamepadBindings: {},
      controlDefaultsP2: {},
      gamepadBindingsP2: {}
    });

    expect(() => new Script(n64Code)).not.toThrow();
    expect(n64Code).toContain("window.EJS_threads = canUseThreads");
    expect(n64Code).toContain('"mupen64plus-EnableHybridFilter": "False"');
    expect(n64Code).toContain('"mupen64plus-43screensize": "640x480"');
  });

  it("should configure PS1 core mapping, filename extension in gameUrl, biosUrl and externalFiles", async () => {
    const { renderEmulatorBootstrap } = await import("../routes/player");
    const { Script } = await import("node:vm");

    const ps1Code = renderEmulatorBootstrap({
      core: "pcsx_rearmed",
      title: "Metal Gear Solid",
      gameId: "ps1-metal-gear-solid",
      romId: 789,
      fileName: "Metal Gear Solid (Disc 1).chd",
      discs: [],
      romHash: "mgs-hash",
      userId: "test-user",
      userName: "Solid Snake",
      profileId: "1",
      biosUrl: "/api/bios/psx/scph5501.bin",
      externalFiles: {
        "disc1.chd": "/api/roms/789/file/disc1.chd",
        "disc2.chd": "/api/roms/790/file/disc2.chd",
      },
      netplayRole: null,
      netplayRoom: null,
      netplaySyncMode: "rollback",
      controlDefaults: {},
      gamepadBindings: {},
      controlDefaultsP2: {},
      gamepadBindingsP2: {}
    });

    expect(() => new Script(ps1Code)).not.toThrow();
    // Core pcsx_rearmed mapped to "psx" for EmulatorJS
    expect(ps1Code).toContain('window.EJS_core = "psx";');
    // Filename appended to gameUrl
    expect(ps1Code).toContain('/file/Metal%20Gear%20Solid%20(Disc%201).chd');
    // BIOS URL injected
    expect(ps1Code).toContain('window.EJS_biosUrl = "/api/bios/psx/scph5501.bin";');
    // External files injected
    expect(ps1Code).toContain('window.EJS_externalFiles = {"disc1.chd":"/api/roms/789/file/disc1.chd","disc2.chd":"/api/roms/790/file/disc2.chd"};');
  });

  it("should render Native Stream Player with binary 7-byte DataChannel and stats HUD", async () => {
    const { renderStreamPlayerPage } = await import("../routes/streamPlayer");

    const html = renderStreamPlayerPage({
      title: "Gran Turismo 2",
      returnTo: "/library",
      romId: 456,
      system: "ps1",
      profileId: 1,
      ingressBase: "/api/hassio_ingress/token123",
    });

    expect(html).toContain("Gran Turismo 2 · Native Stream · HomeArcade");
    expect(html).toContain("new Uint8Array(7)");
    expect(html).toContain("unlockAudio");
    expect(html).toContain("dataChannel.send(inputBuffer)");
    expect(html).toContain("/api/hassio_ingress/token123/api/roms/456/player?return=%2Flibrary&profile=1&engine=wasm");
  });

  it("should configure 30 FPS HUD default for PS2 in Native Stream Player", async () => {
    const { renderStreamPlayerPage } = await import("../routes/streamPlayer");

    const html = renderStreamPlayerPage({
      title: "Final Fantasy X",
      returnTo: "/library",
      romId: 789,
      system: "ps2",
      profileId: 1,
      ingressBase: "/api/hassio_ingress/token123",
    });

    expect(html).toContain("Final Fantasy X · Native Stream · HomeArcade");
    expect(html).toContain("STREAM · 30 FPS");
    expect(html).toContain('<div id="tel-fps" class="telemetry-val">30 FPS</div>');
  });
});

