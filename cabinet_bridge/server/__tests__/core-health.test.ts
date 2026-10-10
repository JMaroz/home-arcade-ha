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
  });

  it("should use the 'play' core for PS2 to match BIOS and core files", () => {
    expect(EMULATORJS_CORES["ps2"]).toBe("play");
    expect(REQUIRED_BIOS["play"]).toBeDefined();
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
});

