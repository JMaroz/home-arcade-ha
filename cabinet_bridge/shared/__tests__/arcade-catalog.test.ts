import { describe, it, expect } from "vitest";
import { getArcadeGameInfo, isArcadeDriverName, NEOGEO_GAMES, ARCADE_GAMES } from "../arcade-catalog";

describe("arcade-catalog", () => {
  it("resolves mslug.zip for neogeo to canonical Metal Slug metadata", () => {
    const info = getArcadeGameInfo("neogeo", "mslug.zip");
    expect(info).not.toBeNull();
    expect(info?.title).toBe("Metal Slug - Super Vehicle-001");
    expect(info?.canonicalName).toBe("Metal Slug - Super Vehicle-001");
    expect(info?.year).toBe(1996);
    expect(info?.developer).toBe("Nazca Corporation");
    expect(info?.genre).toBe("Run and Gun");
    expect(info?.description).toContain("Peregrine Falcon");
  });

  it("handles case insensitivity, uppercase extensions, and raw stem", () => {
    const info1 = getArcadeGameInfo("neogeo", "MSLUG.ZIP");
    const info2 = getArcadeGameInfo("neogeo", "mslug");
    const info3 = getArcadeGameInfo("neogeo", "mslug.7z");

    expect(info1?.title).toBe("Metal Slug - Super Vehicle-001");
    expect(info2?.title).toBe("Metal Slug - Super Vehicle-001");
    expect(info3?.title).toBe("Metal Slug - Super Vehicle-001");
  });

  it("resolves King of Fighters, Samurai Shodown, and Garou", () => {
    const kof = getArcadeGameInfo("neogeo", "kof98");
    expect(kof?.title).toBe("The King of Fighters '98 - The Slugfest");

    const samsho = getArcadeGameInfo("neogeo", "samsh5sp");
    expect(samsho?.title).toBe("Samurai Shodown V Special");
    expect(samsho?.canonicalName).toBe("Samurai Shodown V Special ~ Samurai Spirits Zero Special");

    const garou = getArcadeGameInfo("neogeo", "garou.zip");
    expect(garou?.title).toBe("Garou - Mark of the Wolves");
  });

  it("resolves classic arcade drivers like sf2, tmnt, simpsons", () => {
    const sf2 = getArcadeGameInfo("arcade", "sf2.zip");
    expect(sf2?.title).toBe("Street Fighter II - The World Warrior");
    expect(sf2?.canonicalName).toBe("Street Fighter II - The World Warrior (World 910522)");

    const tmnt = getArcadeGameInfo("arcade", "tmnt");
    expect(tmnt?.title).toBe("Teenage Mutant Ninja Turtles");

    const simpsons = getArcadeGameInfo("arcade", "simpsons.zip");
    expect(simpsons?.title).toBe("The Simpsons");
  });

  it("cross-resolves Neo Geo games placed under arcade system", () => {
    const mslugInArcade = getArcadeGameInfo("arcade", "mslug.zip");
    expect(mslugInArcade).not.toBeNull();
    expect(mslugInArcade?.title).toBe("Metal Slug - Super Vehicle-001");
  });

  it("identifies arcade driver names accurately with isArcadeDriverName", () => {
    expect(isArcadeDriverName("mslug")).toBe(true);
    expect(isArcadeDriverName("mslug.zip")).toBe(true);
    expect(isArcadeDriverName("kof2002")).toBe(true);
    expect(isArcadeDriverName("sf2ce.zip")).toBe(true);
    expect(isArcadeDriverName("super_mario_world.sfc")).toBe(false);
    expect(isArcadeDriverName("pokemon_emerald.gba")).toBe(false);
  });
});
