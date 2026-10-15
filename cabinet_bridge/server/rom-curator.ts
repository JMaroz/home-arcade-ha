import { storage } from "./storage";
import { type UploadedRom } from "@shared/schema";
import { listAllSystemMetas, fetchPlatformGames } from "./archive-client";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

export interface DuplicateGroup {
  baseTitle: string;
  system: string;
  roms: UploadedRom[];
  recommendedRomId: number;
  redundantRomIds: number[];
  reason: string;
}

export interface MissingRomItem {
  system: string;
  title: string;
  fileName: string;
  downloadUrl: string;
  size: number;
}

export interface CurationReport {
  scannedRomsCount: number;
  duplicateGroupCount: number;
  redundantRomsCount: number;
  totalSpaceReclaimableBytes: number;
  duplicateGroups: DuplicateGroup[];
  missingRomsBySystem: Record<string, MissingRomItem[]>;
  userLanguage: string;
}

const REGION_LANGUAGE_MAP: Record<string, string[]> = {
  en: ["usa", "world", "europe", "english", "en"],
  it: ["italy", "italian", "it", "europe", "world", "usa"],
  fr: ["france", "french", "fr", "europe", "world", "usa"],
  de: ["germany", "german", "de", "europe", "world", "usa"],
  es: ["spain", "spanish", "es", "europe", "world", "usa"],
  ja: ["japan", "japanese", "ja"],
};

function normalizeBaseTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\.[^.]+$/, "")
    .replace(/\s*[\(\[].*?[\)\]]/g, "")
    .replace(/[^a-zA-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Calculate region/language suitability score for a ROM given user language preference.
 */
function scoreRomPreference(rom: UploadedRom, userLanguage: string): number {
  let score = 50;
  const title = (rom.originalName + " " + rom.title).toLowerCase();

  // Preferred language/region priority list
  const preferredRegions = REGION_LANGUAGE_MAP[userLanguage] || REGION_LANGUAGE_MAP.en;

  for (let i = 0; i < preferredRegions.length; i++) {
    const term = preferredRegions[i];
    if (title.includes(term)) {
      score += (preferredRegions.length - i) * 15;
      break;
    }
  }

  // Revision / Version bonuses
  if (title.includes("rev 1") || title.includes("v1.1")) score += 5;
  if (title.includes("rev 2") || title.includes("v1.2")) score += 8;

  // Penalize prototypes, betas, demos, unlicensed
  if (title.includes("beta") || title.includes("proto") || title.includes("demo") || title.includes("unl")) {
    score -= 30;
  }

  // Prefer favorites or played games
  if (rom.favorite) score += 20;
  if (rom.playCount > 0) score += 10;

  return score;
}

/**
 * Analyze library for duplicate ROMs and missing catalog games.
 */
export async function analyzeLibraryCuration(): Promise<CurationReport> {
  const settings = await storage.getIntegrationSettings();
  const userLang = (settings.language || "en").toLowerCase();

  const allRoms = await storage.listUploadedRoms();
  const groupedBySystemAndTitle = new Map<string, UploadedRom[]>();

  for (const rom of allRoms) {
    if (rom.isPlaylist) continue; // Skip M3U playlist entries
    const norm = normalizeBaseTitle(rom.title);
    const key = `${rom.system}:::${norm}`;
    if (!groupedBySystemAndTitle.has(key)) {
      groupedBySystemAndTitle.set(key, []);
    }
    groupedBySystemAndTitle.get(key)!.push(rom);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  let redundantRomsCount = 0;
  let totalSpaceReclaimableBytes = 0;

  for (const [key, roms] of groupedBySystemAndTitle.entries()) {
    if (roms.length < 2) continue;

    const [system, baseTitle] = key.split(":::");

    // Score ROMs in group
    const scored = roms.map((rom) => ({
      rom,
      score: scoreRomPreference(rom, userLang),
    }));

    scored.sort((a, b) => b.score - a.score);

    const recommended = scored[0].rom;
    const redundant = scored.slice(1).map((s) => s.rom);

    redundantRomsCount += redundant.length;
    for (const red of redundant) {
      totalSpaceReclaimableBytes += red.size || 0;
    }

    duplicateGroups.push({
      baseTitle: roms[0].title.replace(/\s*[\(\[].*?[\)\]]/g, "").trim(),
      system,
      roms,
      recommendedRomId: recommended.id,
      redundantRomIds: redundant.map((r) => r.id),
      reason: `Consigliato "${recommended.title}" basato sulla preferenza lingua (${userLang.toUpperCase()}) e versione.`,
    });
  }

  // Missing ROMs analysis for active systems
  const activeSystems = [...new Set(allRoms.map((r) => r.system))];
  const missingRomsBySystem: Record<string, MissingRomItem[]> = {};

  for (const sys of activeSystems.slice(0, 5)) { // Limit to 5 active systems for performance
    try {
      const catalog = await fetchPlatformGames(sys, undefined, settings.archiveSource, settings.archiveCustomId);
      const installedNorms = new Set(
        allRoms.filter((r) => r.system === sys).map((r) => normalizeBaseTitle(r.title))
      );

      const missing: MissingRomItem[] = [];
      for (const item of catalog) {
        const itemNorm = normalizeBaseTitle(item.title);
        if (!installedNorms.has(itemNorm)) {
          missing.push({
            system: sys,
            title: item.title,
            fileName: item.fileName,
            downloadUrl: item.downloadUrl,
            size: item.size,
          });
        }
      }

      if (missing.length > 0) {
        missingRomsBySystem[sys] = missing.slice(0, 30); // Top missing games
      }
    } catch {
      // Non-fatal if platform catalog fetch fails
    }
  }

  return {
    scannedRomsCount: allRoms.length,
    duplicateGroupCount: duplicateGroups.length,
    redundantRomsCount,
    totalSpaceReclaimableBytes,
    duplicateGroups,
    missingRomsBySystem,
    userLanguage: userLang,
  };
}

/**
 * Deduplicate redundant ROMs in 1G1R mode according to analysis report.
 */
export async function executeDeduplication(options?: { targetRomIds?: number[] }): Promise<{
  deletedCount: number;
  freedBytes: number;
}> {
  const analysis = await analyzeLibraryCuration();
  let deletedCount = 0;
  let freedBytes = 0;

  const targetSet = options?.targetRomIds ? new Set(options.targetRomIds) : null;

  for (const group of analysis.duplicateGroups) {
    for (const redundantId of group.redundantRomIds) {
      if (targetSet && !targetSet.has(redundantId)) continue;

      const rom = await storage.getUploadedRom(redundantId);
      if (!rom) continue;

      const freedSize = rom.size || 0;
      const success = await storage.deleteUploadedRom(redundantId);
      if (success) {
        // Try unlinking file from disk
        if (rom.filePath) {
          await fs.unlink(rom.filePath).catch(() => {});
        }
        deletedCount++;
        freedBytes += freedSize;
      }
    }
  }

  return { deletedCount, freedBytes };
}
