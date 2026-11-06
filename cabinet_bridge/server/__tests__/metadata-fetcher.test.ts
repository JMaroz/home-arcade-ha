import { describe, it, expect, vi } from "vitest";
import { fetchGameMetadata } from "../metadata-fetcher";

describe("metadata-fetcher with arcade catalog", () => {
  it("resolves mslug.zip for neogeo with canonical title, box art and rich description", async () => {
    const meta = await fetchGameMetadata("neogeo", "mslug.zip");
    expect(meta.scrapeStatus).toBe("matched");
    expect(meta.title).toBe("Metal Slug - Super Vehicle-001");
    expect(meta.releaseYear).toBe(1996);
    expect(meta.developer).toBe("Nazca Corporation");
    expect(meta.publisher).toBe("SNK");
    expect(meta.genre).toBe("Run and Gun");
    expect(meta.description).toContain("Peregrine Falcon");
    expect(meta.artUrl).toBe("https://thumbnails.libretro.com/SNK%20-%20Neo%20Geo/Named_Boxarts/Metal%20Slug%20-%20Super%20Vehicle-001.png");
  });

  it("resolves truncated title 'Mslug' when fileName is 'mslug.zip'", async () => {
    const meta = await fetchGameMetadata("neogeo", "Mslug", null, "mslug.zip");
    expect(meta.scrapeStatus).toBe("matched");
    expect(meta.title).toBe("Metal Slug - Super Vehicle-001");
    expect(meta.artUrl).toBe("https://thumbnails.libretro.com/SNK%20-%20Neo%20Geo/Named_Boxarts/Metal%20Slug%20-%20Super%20Vehicle-001.png");
  });

  it("resolves truncated title 'Mslug' alone via catalog aliases", async () => {
    const meta = await fetchGameMetadata("neogeo", "Mslug");
    expect(meta.scrapeStatus).toBe("matched");
    expect(meta.title).toBe("Metal Slug - Super Vehicle-001");
    expect(meta.artUrl).toBe("https://thumbnails.libretro.com/SNK%20-%20Neo%20Geo/Named_Boxarts/Metal%20Slug%20-%20Super%20Vehicle-001.png");
  });

  it("resolves classic arcade driver sf2.zip", async () => {
    const meta = await fetchGameMetadata("arcade", "sf2.zip");
    expect(meta.scrapeStatus).toBe("matched");
    expect(meta.title).toBe("Street Fighter II - The World Warrior");
    expect(meta.releaseYear).toBe(1991);
    expect(meta.developer).toBe("Capcom");
    expect(meta.artUrl).toBe("https://thumbnails.libretro.com/FBNeo%20-%20Arcade%20Games/Named_Boxarts/Street%20Fighter%20II%20-%20The%20World%20Warrior%20(World%20910522).png");
  });
});
