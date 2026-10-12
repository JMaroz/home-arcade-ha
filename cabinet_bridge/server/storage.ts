import { 
  appSettings, collectionItems, gameCollections, hltbCache, romSaveSlots, 
  uploadedRoms, users, userProfiles, gameCheatCodes, profileGameState, 
  profileControlBindings, gamepadBindings, cheatIndexCache, cheatFileCache, 
  activityLog, playSessions
} from '@shared/schema';
import type {
  GameCollection,
  GameCollectionWithItems,
  HltbCache,
  InsertGameCollection,
  InsertRomSaveSlot,
  InsertUploadedRom,
  IntegrationSettings,
  RomSaveSlot,
  UploadedRom,
  User,
  InsertUser,
  SmartFilterRules,
  UserProfile,
  StorageSnapshot,
} from '@shared/schema';
import { DEFAULT_INTEGRATION_SETTINGS, integrationSettingsSchema } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { and, desc, eq, sql, sum, count } from "drizzle-orm";
import { dataPath, ensureDir, getDataDir } from "./data-dir";
import { log } from "./log";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { REQUIRED_BIOS } from "@shared/bios-metadata";
import { slugify, titleFromFileName, extractUploadedSlug } from "./routes/utils";
import { ROM_ROOT, SAVE_BACKUP_DIR } from "./routes/shared";

export let sqlite: Database.Database;
export let db: any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initializeDatabase() {
  if (sqlite) return;

  try {
    const dataDir = getDataDir();
    ensureDir(dataDir);
    const dbPath = dataPath("data.db");
    
    log(`Connecting to SQLite at ${dbPath}`, "db");
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    
    db = drizzle(sqlite);

    // Run migrations
    log("Running migrations...", "db");
    // Bundle-safe migration path: dist/index.cjs is one level down from root (dist/)
    // so we go up one level and then into migrations/
    const migrationsFolder = path.join(__dirname, "..", "migrations");
    try {
      migrate(db, { migrationsFolder });
      log("Migrations complete", "db");
    } catch (migErr: any) {
      log(`Migration error: ${migErr.message}`, "db");
      // Fallback to process.cwd() just in case
      try {
        const fallbackPath = path.join(process.cwd(), "migrations");
        if (fallbackPath !== migrationsFolder) {
          migrate(db, { migrationsFolder: fallbackPath });
          log("Migrations complete (fallback)", "db");
        }
      } catch {}
    }

    // Fail-safe for missing rom_id columns in tables created by migrations
    // Pattern matches the existing rom_hash fail-safe above
    for (const [table, col] of [
      ["play_sessions", "rom_id"],
      ["game_cheat_codes", "rom_id"],
      ["gamepad_bindings", "rom_id"],
      ["profile_game_state", "rom_id"],
    ] as [string, string][]) {
      try {
        const info = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
        if (!info.some((c: any) => c.name === col)) {
          log(`Fail-safe: Column "${col}" missing from "${table}" — will attempt to add it`, "db");
          try {
            sqlite.prepare(`ALTER TABLE "${table}" ADD COLUMN "${col}" integer`).run();
            log(`Fail-safe: Added "${col}" to "${table}"`, "db");
          } catch (addErr: any) {
            log(`Fail-safe could not add "${col}" to "${table}": ${addErr.message}`, "db");
          }
        }
      } catch (e: any) {
        log(`Fail-safe check for "${col}" in "${table}" failed: ${e.message}`, "db");
      }
    }

    // Fail-safe for missing rom_hash column in rom_save_slots
    try {
      const info = sqlite.prepare("PRAGMA table_info(rom_save_slots)").all() as any[];
      if (!info.some(col => col.name === "rom_hash")) {
        log("Fail-safe: Adding rom_hash column to rom_save_slots", "db");
        sqlite.prepare("ALTER TABLE rom_save_slots ADD COLUMN rom_hash TEXT").run();
      }
    } catch (e: any) {
      log(`Fail-safe (rom_hash) error: ${e.message}`, "db");
    }

    // Default Profile
    try {
      const exists = db.select().from(userProfiles).where(eq(userProfiles.id, 1)).get();
      if (!exists) {
        db.insert(userProfiles).values({ id: 1, name: 'Player 1', color: '#8b5cf6', createdAt: Date.now() }).run();
        log("Default profile created", "db");
      }
    } catch (err: any) {
      log(`Failed to create default profile: ${err.message}`, "db");
    }

    // Migration: Reset erroneously auto-favorited ROMs from legacy default(true)
    try {
      sqlite.prepare("CREATE TABLE IF NOT EXISTS _system_meta (key TEXT PRIMARY KEY, value TEXT)").run();
      const prefCheck = sqlite.prepare("SELECT value FROM _system_meta WHERE key = 'favorite_default_reset'").get() as any;
      if (!prefCheck) {
        sqlite.prepare("UPDATE uploaded_roms SET favorite = 0").run();
        sqlite.prepare("INSERT OR REPLACE INTO _system_meta (key, value) VALUES ('favorite_default_reset', 'done')").run();
        log("Reset legacy auto-favorited ROMs (favorite = 0)", "db");
      }
    } catch (err: any) {
      log(`Favorite reset check: ${err.message}`, "db");
    }

    log("Database ready", "db");
  } catch (err) {
    log("CRITICAL: Database failure!", "db");
    throw err;
  }
}

// Auto-initialize on import
initializeDatabase();

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUploadedRoms(excludeChildren?: boolean): Promise<UploadedRom[]>;
  listUploadedRomsPaginated(limit: number, offset: number, excludeChildren?: boolean): Promise<UploadedRom[]>;
  countUploadedRoms(excludeChildren?: boolean): Promise<number>;
  getRomMoveStats(): Promise<{ total: number; totalSize: number; systems: { system: string; count: number; size: number }[] }>;
  getUploadedRom(id: number): Promise<UploadedRom | undefined>;
  createUploadedRom(rom: InsertUploadedRom): Promise<UploadedRom>;
  deleteUploadedRom(id: number): Promise<UploadedRom | undefined>;
  updateUploadedRomArt(id: number, art: any): Promise<UploadedRom | undefined>;
  updateUploadedRomRating(id: number, rating: number): Promise<UploadedRom | undefined>;
  updateUploadedRomFavorite(id: number, favorite: boolean): Promise<UploadedRom | undefined>;
  markUploadedRomPlayed(id: number): Promise<UploadedRom | undefined>;
  listRomsByDiscGroup(discGroup: string): Promise<UploadedRom[]>;
  incrementRomMinutesPlayed(id: number, minutes: number): Promise<UploadedRom | undefined>;
  updateUploadedRomPlayStatus(id: number, status: string): Promise<UploadedRom | undefined>;
  createPlaySession(romId: number, romTitle: string, romSystem: string, startedAt: number): Promise<number>;
  endPlaySession(sessionId: number, endedAt: number, durationSeconds: number): Promise<void>;
  listRecentSessions(limit?: number): Promise<any[]>;
  getPlayStatsSummary(): Promise<any>;
  getHallOfFame(limit?: number): Promise<UploadedRom[]>;
  updateUploadedRomMetadata(id: number, meta: any): Promise<UploadedRom | undefined>;
  listCollections(): Promise<GameCollectionWithItems[]>;
  createCollection(collection: InsertGameCollection): Promise<GameCollection>;
  deleteCollection(id: number): Promise<boolean>;
  renameCollection(id: number, name: string): Promise<GameCollection | undefined>;
  updateSmartFilter(id: number, update: { name?: string; rules?: any }): Promise<GameCollection | undefined>;
  addRomToCollection(collectionId: number, romId: number): Promise<GameCollectionWithItems | undefined>;
  removeRomFromCollection(collectionId: number, romId: number): Promise<GameCollectionWithItems | undefined>;
  listRomSaveSlots(romId: number, userId: string): Promise<RomSaveSlot[]>;
  upsertRomSaveSlot(saveSlot: InsertRomSaveSlot): Promise<RomSaveSlot>;
  deleteRomSaveSlot(romId: number, slot: number, userId: string): Promise<boolean>;
  relinkSaveSlotsByHash(romId: number, romHash: string): Promise<void>;
  getIntegrationSettings(): Promise<IntegrationSettings>;
  saveIntegrationSettings(settings: IntegrationSettings): Promise<IntegrationSettings>;
  listProfiles(): Promise<UserProfile[]>;
  createProfile(name: string, color: string): Promise<UserProfile>;
  deleteProfile(id: number): Promise<boolean>;
  listCheats(romId: number, profileId: number): Promise<any[]>;
  createCheat(cheat: any): Promise<any>;
  updateCheatEnabled(id: number, enabled: boolean): Promise<boolean>;
  deleteCheat(id: number): Promise<boolean>;
  getProfileGameState(profileId: number, romId: number): Promise<any>;
  upsertProfileGameState(profileId: number, romId: number, patch: any): Promise<any>;
  listProfileGameStates(profileId: number): Promise<any[]>;
  getProfileControlBindings(profileId: number, core: string): Promise<any>;
  setProfileControlBindings(profileId: number, core: string, bindings: any): Promise<void>;
  getGamepadBindings(profileId: number, gamepadId: string): Promise<any>;
  setGamepadBindings(profileId: number, gamepadId: string, bindings: any): Promise<void>;
  listGamepadBindings(profileId: number): Promise<any[]>;
  getCheatIndex(folder: string): Promise<any>;
  setCheatIndex(folder: string, files: any[]): Promise<void>;
  getCachedCheats(path: string): Promise<any>;
  setCachedCheats(path: string, cheats: any[]): Promise<void>;
  clearCheatCache(): Promise<void>;
  getHltbCache(romId: number): Promise<any>;
  saveHltbCache(data: any): Promise<void>;
  addScannedRom(rom: any): Promise<UploadedRom>;
  listRomFilenames(): Promise<string[]>;
  listActivityLog(limit?: number): Promise<any[]>;
  addActivityLogEntry(entry: any): Promise<any>;
  clearActivityLog(): Promise<void>;

  // Bulk cleanup methods
  getDuplicateGroups(): Promise<{ romHash: string; ids: number[]; count: number }[]>;
  countUnplayedRoms(system?: string): Promise<number>;
  countFailedScrapes(): Promise<number>;
  deleteDuplicateRoms(): Promise<{ deletedCount: number; keptCount: number }>;
  deleteUnplayedRoms(system?: string): Promise<{ deletedCount: number }>;
  deleteFailedScrapes(): Promise<{ deletedCount: number }>;
  deleteUploadedRomWithFile(id: number): Promise<UploadedRom | undefined>;
  getStorageSnapshot(): Promise<StorageSnapshot>;
}

const INTEGRATION_SETTINGS_KEY = "integration";

function getAbsoluteFilePath(
  rom: { filePath: string; system: string; fileName: string },
  watchPaths: string[]
): string {
  const directPath = path.resolve(rom.filePath);
  if (existsSync(directPath)) {
    return directPath;
  }

  const normalisedPath = rom.filePath.replace(/\\/g, "/");
  const sysSegment = `/${rom.system.toLowerCase()}/`;
  const sysIdx = normalisedPath.toLowerCase().indexOf(sysSegment);

  if (sysIdx !== -1) {
    const relativePath = normalisedPath.slice(sysIdx + 1);
    for (const wp of watchPaths) {
      const localPath = path.resolve(wp, relativePath);
      if (existsSync(localPath)) {
        return localPath;
      }
    }
  }

  return directPath;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> { return db.select().from(users).where(eq(users.id, id)).get(); }
  async getUserByUsername(username: string): Promise<User | undefined> { return db.select().from(users).where(eq(users.username, username)).get(); }
  async createUser(insertUser: InsertUser): Promise<User> { return db.insert(users).values(insertUser).returning().get(); }
  async listUploadedRoms(excludeChildren = false): Promise<UploadedRom[]> {
    if (excludeChildren) {
      return db.select().from(uploadedRoms)
        .where(sql`${uploadedRoms.parentM3uId} IS NULL`)
        .orderBy(desc(uploadedRoms.createdAt)).all();
    }
    return db.select().from(uploadedRoms).orderBy(desc(uploadedRoms.createdAt)).all();
  }
  async listUploadedRomsPaginated(limit: number, offset: number, excludeChildren = false): Promise<UploadedRom[]> {
    if (excludeChildren) {
      return db.select().from(uploadedRoms)
        .where(sql`${uploadedRoms.parentM3uId} IS NULL`)
        .orderBy(desc(uploadedRoms.createdAt)).limit(limit).offset(offset).all();
    }
    return db.select().from(uploadedRoms).orderBy(desc(uploadedRoms.createdAt)).limit(limit).offset(offset).all();
  }
  async countUploadedRoms(excludeChildren = false): Promise<number> {
    if (excludeChildren) {
      const row = db.select({ count: sql<number>`count(*)` }).from(uploadedRoms)
        .where(sql`${uploadedRoms.parentM3uId} IS NULL`).get();
      return row?.count ?? 0;
    }
    const row = db.select({ count: sql<number>`count(*)` }).from(uploadedRoms).get();
    return row?.count ?? 0;
  }
  async getRomMoveStats(): Promise<{ total: number; totalSize: number; systems: { system: string; count: number; size: number }[] }> {
    const totalRow = db.select({
      count: sql<number>`count(*)`,
      totalSize: sql<number>`coalesce(sum(${uploadedRoms.size}), 0)`,
    }).from(uploadedRoms).get();
    const systems = db.select({
      system: uploadedRoms.system,
      count: sql<number>`count(*)`,
      size: sql<number>`coalesce(sum(${uploadedRoms.size}), 0)`,
    }).from(uploadedRoms)
      .groupBy(uploadedRoms.system)
      .orderBy(uploadedRoms.system)
      .all();
    return { total: totalRow?.count ?? 0, totalSize: totalRow?.totalSize ?? 0, systems: systems as any };
  }
  async getUploadedRom(id: number): Promise<UploadedRom | undefined> { return db.select().from(uploadedRoms).where(eq(uploadedRoms.id, id)).get(); }
  async listRomsByDiscGroup(discGroup: string): Promise<UploadedRom[]> { return db.select().from(uploadedRoms).where(eq(uploadedRoms.discGroup, discGroup)).orderBy(uploadedRoms.discNumber).all(); }
  async listDiscGroupsWithCount(minCount = 2): Promise<{ discGroup: string; count: number }[]> {
    const rows = db.select({
      discGroup: uploadedRoms.discGroup,
      count: sql<number>`count(*)`,
    }).from(uploadedRoms)
      .where(and(sql`${uploadedRoms.discGroup} IS NOT NULL`, sql`${uploadedRoms.isPlaylist} = 0`, sql`${uploadedRoms.parentM3uId} IS NULL`))
      .groupBy(uploadedRoms.discGroup)
      .having(sql`count(*) >= ${minCount}`)
      .all();
    return rows as any;
  }
  async listRomsByDiscGroupNoM3u(discGroup: string): Promise<UploadedRom[]> {
    return db.select().from(uploadedRoms)
      .where(and(
        eq(uploadedRoms.discGroup, discGroup),
        eq(uploadedRoms.isPlaylist, false),
        sql`${uploadedRoms.parentM3uId} IS NULL`,
      ))
      .orderBy(uploadedRoms.discNumber).all();
  }
  async listChildrenByM3uId(m3uId: number): Promise<UploadedRom[]> {
    return db.select().from(uploadedRoms)
      .where(eq(uploadedRoms.parentM3uId, m3uId))
      .orderBy(uploadedRoms.discNumber).all();
  }
  async findM3uForDiscGroup(discGroup: string): Promise<UploadedRom | undefined> {
    return db.select().from(uploadedRoms)
      .where(and(eq(uploadedRoms.discGroup, discGroup), eq(uploadedRoms.isPlaylist, true)))
      .get();
  }
  async createUploadedRom(rom: InsertUploadedRom): Promise<UploadedRom> { return db.insert(uploadedRoms).values(rom).returning().get(); }
  async findRomByOriginalName(name: string): Promise<UploadedRom | undefined> {
    return db.select().from(uploadedRoms).where(eq(uploadedRoms.originalName, name)).get();
  }
  async findRomByHash(hash: string): Promise<UploadedRom | undefined> {
    return db.select().from(uploadedRoms).where(eq(uploadedRoms.romHash, hash)).get();
  }
  async updateUploadedRomFile(id: number, data: Partial<InsertUploadedRom>): Promise<UploadedRom | undefined> {
    return db.update(uploadedRoms).set(data).where(eq(uploadedRoms.id, id)).returning().get();
  }
  async incrementRomMinutesPlayed(id: number, minutes: number): Promise<UploadedRom | undefined> {
    const rom = await this.getUploadedRom(id);
    if (!rom) return undefined;
    return db.update(uploadedRoms).set({ minutesPlayed: (rom.minutesPlayed ?? 0) + Math.max(0, Math.round(minutes)) }).where(eq(uploadedRoms.id, id)).returning().get();
  }
  async updateUploadedRomMetadata(id: number, meta: any): Promise<UploadedRom | undefined> { return db.update(uploadedRoms).set(meta).where(eq(uploadedRoms.id, id)).returning().get(); }
  async deleteUploadedRom(id: number): Promise<UploadedRom | undefined> {
    const rom = await this.getUploadedRom(id);
    if (!rom) return undefined;
    db.delete(collectionItems).where(eq(collectionItems.romId, id)).run();
    db.delete(romSaveSlots).where(eq(romSaveSlots.romId, id)).run();
    db.delete(uploadedRoms).where(eq(uploadedRoms.id, id)).run();
    return rom;
  }

  async deleteUploadedRomWithFile(id: number): Promise<UploadedRom | undefined> {
    const rom = await this.getUploadedRom(id);
    if (!rom) return undefined;

    const settings = await this.getIntegrationSettings();
    const watchPaths = (settings.libraryWatchPaths ?? "")
      .split(",")
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);
    const resolvedPath = getAbsoluteFilePath(rom, watchPaths);

    try {
      await fs.unlink(resolvedPath);
      log(`Deleted file: ${resolvedPath}`, "storage");
    } catch {
      log(`File not found (skipping unlink): ${resolvedPath}`, "storage");
    }

    return this.deleteUploadedRom(id);
  }
  async updateUploadedRomArt(id: number, art: any): Promise<UploadedRom | undefined> { return db.update(uploadedRoms).set(art).where(eq(uploadedRoms.id, id)).returning().get(); }
  async updateUploadedRomPlayStatus(id: number, status: string): Promise<UploadedRom | undefined> { return db.update(uploadedRoms).set({ playStatus: status }).where(eq(uploadedRoms.id, id)).returning().get(); }
  async updateUploadedRomRating(id: number, rating: number): Promise<UploadedRom | undefined> { return db.update(uploadedRoms).set({ rating }).where(eq(uploadedRoms.id, id)).returning().get(); }
  async updateUploadedRomFavorite(id: number, favorite: boolean): Promise<UploadedRom | undefined> { return db.update(uploadedRoms).set({ favorite: favorite ? 1 : 0 }).where(eq(uploadedRoms.id, id)).returning().get(); }
  async markUploadedRomPlayed(id: number): Promise<UploadedRom | undefined> {
    const rom = await this.getUploadedRom(id);
    if (!rom) return undefined;
    return db.update(uploadedRoms).set({ lastPlayed: Date.now(), playCount: (rom.playCount ?? 0) + 1 }).where(eq(uploadedRoms.id, id)).returning().get();
  }
  async listCollections(): Promise<GameCollectionWithItems[]> {
    const collections_ = db.select().from(gameCollections).orderBy(desc(gameCollections.createdAt)).all();
    const items = db.select().from(collectionItems).all();
    return collections_.map((collection: any) => ({
      ...collection,
      smartFilter: collection.smartFilter ? JSON.parse(collection.smartFilter) : undefined,
      romIds: items.filter((item: any) => item.collectionId === collection.id).map((item: any) => item.romId),
    }));
  }
  async createCollection(collection: InsertGameCollection): Promise<GameCollection> { return db.insert(gameCollections).values(collection).returning().get(); }
  async deleteCollection(id: number): Promise<boolean> {
    db.delete(collectionItems).where(eq(collectionItems.collectionId, id)).run();
    const result = db.delete(gameCollections).where(eq(gameCollections.id, id)).run();
    return result.changes > 0;
  }
  async renameCollection(id: number, name: string): Promise<GameCollection | undefined> { return db.update(gameCollections).set({ name }).where(eq(gameCollections.id, id)).returning().get(); }
  async updateSmartFilter(id: number, update: { name?: string; rules?: any }): Promise<GameCollection | undefined> {
    const setPayload: Record<string, any> = {};
    if (update.name !== undefined) setPayload.name = update.name;
    if (update.rules !== undefined) setPayload.smartFilter = JSON.stringify(update.rules);
    if (Object.keys(setPayload).length === 0) {
      return (await this.listCollections()).find(c => c.id === id);
    }
    return db.update(gameCollections).set(setPayload).where(eq(gameCollections.id, id)).returning().get();
  }
  async addRomToCollection(collectionId: number, romId: number): Promise<GameCollectionWithItems | undefined> {
    db.insert(collectionItems).values({ collectionId, romId, createdAt: Date.now() }).onConflictDoNothing().run();
    const collections = await this.listCollections();
    return collections.find(c => c.id === collectionId);
  }
  async removeRomFromCollection(collectionId: number, romId: number): Promise<GameCollectionWithItems | undefined> {
    db.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.romId, romId))).run();
    const collections = await this.listCollections();
    return collections.find(c => c.id === collectionId);
  }
  async listRomSaveSlots(romId: number, userId: string): Promise<RomSaveSlot[]> {
    return db.select().from(romSaveSlots).where(and(eq(romSaveSlots.romId, romId), eq(romSaveSlots.userId, userId))).orderBy(romSaveSlots.slot).all();
  }
  async listAllRomSaveSlots(romId: number): Promise<RomSaveSlot[]> {
    return db.select().from(romSaveSlots).where(eq(romSaveSlots.romId, romId)).all();
  }
  async upsertRomSaveSlot(saveSlot: InsertRomSaveSlot): Promise<RomSaveSlot> {
    const existing = db.select().from(romSaveSlots).where(and(eq(romSaveSlots.romId, saveSlot.romId), eq(romSaveSlots.userId, saveSlot.userId ?? "default"), eq(romSaveSlots.slot, saveSlot.slot))).get();
    const now = Date.now();
    if (existing) {
      db.update(romSaveSlots).set({ 
        label: saveSlot.label, 
        updatedAt: now,
        romHash: saveSlot.romHash || existing.romHash 
      }).where(eq(romSaveSlots.id, existing.id)).run();
      return { ...existing, label: saveSlot.label, updatedAt: now };
    }
    const inserted = db.insert(romSaveSlots).values({ ...saveSlot, updatedAt: now }).returning().get();
    return inserted;
  }
  async deleteRomSaveSlot(romId: number, slot: number, userId: string): Promise<boolean> {
    const result = db.delete(romSaveSlots).where(and(eq(romSaveSlots.romId, romId), eq(romSaveSlots.userId, userId), eq(romSaveSlots.slot, slot))).run();
    return result.changes > 0;
  }
  async relinkSaveSlotsByHash(romId: number, romHash: string): Promise<void> {
    // Find slots that match the hash but belong to a different romId
    const orphaned = db.select().from(romSaveSlots).where(and(eq(romSaveSlots.romHash, romHash), eq(romSaveSlots.romId, romId))).all();
    // If they already point to the new romId, we're done.
    // Actually, we want to find slots where romHash matches but romId is different.
    const toUpdate = db.select().from(romSaveSlots).where(and(eq(romSaveSlots.romHash, romHash), eq(romSaveSlots.romId, romId))).all(); // Wait, logic error in my head.
    
    // Correct logic: find ANY slot with this hash, and update its romId to the new one.
    db.update(romSaveSlots).set({ romId }).where(eq(romSaveSlots.romHash, romHash)).run();
  }
  async getIntegrationSettings(): Promise<IntegrationSettings> {
    const row = db.select().from(appSettings).where(eq(appSettings.key, INTEGRATION_SETTINGS_KEY)).get();
    if (!row) return DEFAULT_INTEGRATION_SETTINGS;
    try {
      const parsed = JSON.parse(row.value);
      return integrationSettingsSchema.parse(parsed);
    } catch {
      return DEFAULT_INTEGRATION_SETTINGS;
    }
  }
  async saveIntegrationSettings(settings: IntegrationSettings): Promise<IntegrationSettings> {
    const validated = integrationSettingsSchema.parse(settings);
    const value = JSON.stringify(validated);
    const existing = db.select().from(appSettings).where(eq(appSettings.key, INTEGRATION_SETTINGS_KEY)).get();
    if (existing) {
      db.update(appSettings).set({ value, updatedAt: Date.now() }).where(eq(appSettings.key, INTEGRATION_SETTINGS_KEY)).run();
    } else {
      db.insert(appSettings).values({ key: INTEGRATION_SETTINGS_KEY, value, updatedAt: Date.now() }).run();
    }
    return validated;
  }
  async listProfiles(): Promise<UserProfile[]> { return db.select().from(userProfiles).all(); }
  async createProfile(name: string, color: string): Promise<UserProfile> { return db.insert(userProfiles).values({ name, color, createdAt: Date.now() }).returning().get(); }
  async deleteProfile(id: number): Promise<boolean> {
    if (id === 1) return false;
    db.delete(gameCheatCodes).where(eq(gameCheatCodes.profileId, id)).run();
    db.delete(profileGameState).where(eq(profileGameState.profileId, id)).run();
    db.delete(profileControlBindings).where(eq(profileControlBindings.profileId, id)).run();
    db.delete(gamepadBindings).where(eq(gamepadBindings.profileId, id)).run();
    const result = db.delete(userProfiles).where(eq(userProfiles.id, id)).run();
    return result.changes > 0;
  }
  async listCheats(romId: number, profileId: number): Promise<any[]> { return db.select().from(gameCheatCodes).where(and(eq(gameCheatCodes.romId, romId), eq(gameCheatCodes.profileId, profileId))).all(); }
  async createCheat(cheat: any): Promise<any> { return db.insert(gameCheatCodes).values({ ...cheat, createdAt: Date.now() }).returning().get(); }
  async updateCheatEnabled(id: number, enabled: boolean): Promise<boolean> {
    const result = db.update(gameCheatCodes).set({ enabled }).where(eq(gameCheatCodes.id, id)).run();
    return result.changes > 0;
  }
  async deleteCheat(id: number): Promise<boolean> {
    const result = db.delete(gameCheatCodes).where(eq(gameCheatCodes.id, id)).run();
    return result.changes > 0;
  }
  async getProfileGameState(profileId: number, romId: number): Promise<any> { return db.select().from(profileGameState).where(and(eq(profileGameState.profileId, profileId), eq(profileGameState.romId, romId))).get(); }
  async upsertProfileGameState(profileId: number, romId: number, patch: any): Promise<any> {
    const existing = await this.getProfileGameState(profileId, romId);
    if (existing) {
      return db.update(profileGameState).set({ ...patch, updatedAt: Date.now() }).where(eq(profileGameState.id, existing.id)).returning().get();
    }
    return db.insert(profileGameState).values({ profileId, romId, ...patch, updatedAt: Date.now() }).returning().get();
  }
  async listProfileGameStates(profileId: number): Promise<any[]> { return db.select().from(profileGameState).where(eq(profileGameState.profileId, profileId)).all(); }
  async getProfileControlBindings(profileId: number, core: string): Promise<any> {
    const row = db.select().from(profileControlBindings).where(and(eq(profileControlBindings.profileId, profileId), eq(profileControlBindings.core, core))).get();
    return row ? JSON.parse(row.bindings) : null;
  }
  async setProfileControlBindings(profileId: number, core: string, bindings: any): Promise<void> {
    const value = JSON.stringify(bindings);
    const existing = db.select().from(profileControlBindings).where(and(eq(profileControlBindings.profileId, profileId), eq(profileControlBindings.core, core))).get();
    if (existing) {
      db.update(profileControlBindings).set({ bindings: value, updatedAt: Date.now() }).where(eq(profileControlBindings.id, existing.id)).run();
    } else {
      db.insert(profileControlBindings).values({ profileId, core, bindings: value, updatedAt: Date.now() }).run();
    }
  }
  async getGamepadBindings(profileId: number, gamepadId: string, romId?: number): Promise<any> {
    // Per-game binding takes priority; fall back to profile-level default
    if (romId !== undefined) {
      const row = db.select().from(gamepadBindings).where(and(
        eq(gamepadBindings.profileId, profileId),
        eq(gamepadBindings.gamepadId, gamepadId),
        eq(gamepadBindings.romId, romId)
      )).get();
      if (row) return JSON.parse(row.bindings);
    }
    // Profile-level fallback
    const row = db.select().from(gamepadBindings).where(and(
      eq(gamepadBindings.profileId, profileId),
      eq(gamepadBindings.gamepadId, gamepadId),
    )).get();
    return row ? JSON.parse(row.bindings) : null;
  }
  async setGamepadBindings(profileId: number, gamepadId: string, bindings: any, romId?: number): Promise<void> {
    const value = JSON.stringify(bindings);
    if (romId !== undefined) {
      const existing = db.select().from(gamepadBindings).where(and(
        eq(gamepadBindings.profileId, profileId),
        eq(gamepadBindings.gamepadId, gamepadId),
        eq(gamepadBindings.romId, romId)
      )).get();
      if (existing) {
        db.update(gamepadBindings).set({ bindings: value, updatedAt: Date.now() }).where(eq(gamepadBindings.id, existing.id)).run();
      } else {
        db.insert(gamepadBindings).values({ profileId, gamepadId, romId, bindings: value, updatedAt: Date.now() }).run();
      }
    } else {
      // Profile-level binding (clear any per-game overrides for this profile/gamepad)
      db.delete(gamepadBindings).where(and(
        eq(gamepadBindings.profileId, profileId),
        eq(gamepadBindings.gamepadId, gamepadId),
      )).run();
      db.insert(gamepadBindings).values({ profileId, gamepadId, bindings: value, updatedAt: Date.now() }).run();
    }
  }
  async listGamepadBindings(profileId: number): Promise<any[]> { return db.select().from(gamepadBindings).where(eq(gamepadBindings.profileId, profileId)).all(); }
  async getCheatIndex(folder: string): Promise<any> {
    const row = db.select().from(cheatIndexCache).where(eq(cheatIndexCache.folder, folder)).get();
    return row ? JSON.parse(row.filesJson) : null;
  }
  async setCheatIndex(folder: string, files: any[]): Promise<void> {
    const value = JSON.stringify(files);
    const existing = db.select().from(cheatIndexCache).where(eq(cheatIndexCache.folder, folder)).get();
    if (existing) {
      db.update(cheatIndexCache).set({ filesJson: value, cachedAt: Date.now() }).where(eq(cheatIndexCache.folder, folder)).run();
    } else {
      db.insert(cheatIndexCache).values({ folder, filesJson: value, cachedAt: Date.now() }).run();
    }
  }
  async getCachedCheats(path: string): Promise<any> {
    const row = db.select().from(cheatFileCache).where(eq(cheatFileCache.path, path)).get();
    return row ? JSON.parse(row.cheatsJson) : null;
  }
  async setCachedCheats(path: string, cheats: any[]): Promise<void> {
    const value = JSON.stringify(cheats);
    const existing = db.select().from(cheatFileCache).where(eq(cheatFileCache.path, path)).get();
    if (existing) {
      db.update(cheatFileCache).set({ cheatsJson: value, cachedAt: Date.now() }).where(eq(cheatFileCache.path, path)).run();
    } else {
      db.insert(cheatFileCache).values({ path, cheatsJson: value, cachedAt: Date.now() }).run();
    }
  }
  async clearCheatCache(): Promise<void> {
    db.delete(cheatIndexCache).run();
    db.delete(cheatFileCache).run();
  }
  async getHltbCache(romId: number): Promise<any> { return db.select().from(hltbCache).where(eq(hltbCache.romId, romId)).get(); }
  async saveHltbCache(data: any): Promise<void> {
    const existing = await this.getHltbCache(data.romId);
    if (existing) {
      db.update(hltbCache).set({ ...data, cachedAt: Date.now() }).where(eq(hltbCache.id, existing.id)).run();
    } else {
      db.insert(hltbCache).values({ ...data, cachedAt: Date.now() }).run();
    }
  }
  async addScannedRom(rom: any): Promise<UploadedRom> { return db.insert(uploadedRoms).values(rom).returning().get(); }
  async addScannedRomsBulk(roms: any[]): Promise<void> {
    if (roms.length === 0) return;
    db.transaction((tx: typeof db) => {
      for (const rom of roms) {
        tx.insert(uploadedRoms).values(rom).run();
      }
    });
    // Auto-generate M3U for any complete disc groups found during scan
    await this.generateM3uForAllDiscGroups();
    // Link scanned M3U playlists to their disc files (including slug-renamed CHDs) and prune orphan M3Us
    await this.reconcileM3uPlaylists();
  }

  /**
   * Resolves all disc ROM records referenced by an M3U playlist ROM, matching either by
   * exact filename/originalName or by uploaded slug (`<system>_<slug>_<id>.<ext>`).
   * Automatically links resolved disc records via `parentM3uId` and normalizes the M3U content.
   */
  async resolveM3uDiscs(m3uRom: UploadedRom): Promise<UploadedRom[]> {
    const existingChildren = await this.listChildrenByM3uId(m3uRom.id);
    let rawContent = m3uRom.m3uContent ?? "";
    if (!rawContent && m3uRom.filePath && existsSync(m3uRom.filePath)) {
      try {
        rawContent = await fs.readFile(m3uRom.filePath, "utf8");
      } catch {}
    }

    const refs = rawContent
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    if (existingChildren.length > 0 && existingChildren.length >= refs.length) {
      return existingChildren;
    }

    if (refs.length === 0) {
      return existingChildren;
    }

    const systemRoms = (await this.listRomsBySystem(m3uRom.system))
      .filter((r) => !r.isPlaylist && r.id !== m3uRom.id)
      .sort((a, b) => (a.discNumber ?? 0) - (b.discNumber ?? 0) || a.fileName.localeCompare(b.fileName));

    const usedIds = new Set<number>();
    const resolved: UploadedRom[] = [];

    for (let idx = 0; idx < refs.length; idx++) {
      const ref = refs[idx];
      const refBase = path.basename(ref).toLowerCase();
      const targetSlug = slugify(titleFromFileName(ref));

      // 1. Exact originalName or fileName match
      let match = systemRoms.find(
        (r) => !usedIds.has(r.id) && (r.originalName.toLowerCase() === refBase || r.fileName.toLowerCase() === refBase)
      );

      // 2. Fallback: slug-renamed uploaded ROM match (`<system>_<slug>_<suffix>.<ext>`)
      if (!match && targetSlug) {
        match = systemRoms.find(
          (r) =>
            !usedIds.has(r.id) &&
            (extractUploadedSlug(r.fileName, r.system) === targetSlug ||
              extractUploadedSlug(r.originalName, r.system) === targetSlug)
        );
      }

      if (match) {
        usedIds.add(match.id);
        const desiredDiscNum = refs.length > 1 ? (match.discNumber ?? idx + 1) : match.discNumber;
        if (match.parentM3uId !== m3uRom.id || match.discNumber !== desiredDiscNum) {
          const updated = await this.updateUploadedRomFile(match.id, {
            parentM3uId: m3uRom.id,
            discNumber: desiredDiscNum,
          });
          if (updated) match = updated;
        }
        resolved.push(match);
      }
    }

    if (resolved.length > 0) {
      const normalizedLines = resolved.map((d) => d.fileName).join("\n") + "\n";
      if (m3uRom.m3uContent !== normalizedLines.trim()) {
        await this.updateUploadedRomFile(m3uRom.id, { m3uContent: normalizedLines.trim() });
      }
      if (m3uRom.filePath && existsSync(m3uRom.filePath)) {
        try {
          const currentDisk = await fs.readFile(m3uRom.filePath, "utf8");
          if (currentDisk !== normalizedLines) {
            await fs.writeFile(m3uRom.filePath, normalizedLines, "utf8");
          }
        } catch {}
      }
    }

    return resolved;
  }

  /**
   * Reconciles all M3U playlists in the database:
   * - Links each valid M3U to its disc ROMs (`parentM3uId`) and updates the M3U on disk with actual filenames.
   * - Removes orphaned M3U playlists whose referenced disc files do not exist in the DB or on disk.
   */
  async reconcileM3uPlaylists(): Promise<{ linkedDiscs: number; prunedOrphans: number }> {
    const allRoms = await this.listUploadedRoms(false);
    const playlists = allRoms.filter((r) => r.isPlaylist);
    let linkedDiscs = 0;
    let prunedOrphans = 0;

    for (const m3u of playlists) {
      const discs = await this.resolveM3uDiscs(m3u);
      if (discs.length > 0) {
        linkedDiscs += discs.length;
        continue;
      }

      // Check if any referenced disc file exists directly on disk in the M3U directory
      const m3uDir = m3u.filePath ? path.dirname(m3u.filePath) : "";
      const refs = (m3u.m3uContent ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));

      const hasDiskFile =
        m3uDir &&
        refs.some((ref) => existsSync(path.join(m3uDir, path.basename(ref))));

      if (!hasDiskFile) {
        log(`Pruning orphaned M3U playlist "${m3u.title}" (ID ${m3u.id}) — referenced disc files missing`, "storage");
        await this.deleteUploadedRom(m3u.id);
        if (m3u.filePath && existsSync(m3u.filePath)) {
          await fs.unlink(m3u.filePath).catch(() => {});
        }
        prunedOrphans++;
      }
    }

    if (linkedDiscs > 0 || prunedOrphans > 0) {
      log(`M3U reconciliation complete: ${linkedDiscs} disc(s) linked, ${prunedOrphans} orphan M3U(s) pruned`, "storage");
    }
    return { linkedDiscs, prunedOrphans };
  }
  async generateM3uForAllDiscGroups(): Promise<void> {
    const groups = await db.select({
      discGroup: uploadedRoms.discGroup,
    }).from(uploadedRoms)
      .where(and(sql`${uploadedRoms.discGroup} IS NOT NULL`, sql`${uploadedRoms.isPlaylist} = 0`, sql`${uploadedRoms.parentM3uId} IS NULL`))
      .groupBy(uploadedRoms.discGroup)
      .having(sql`count(*) >= 2`)
      .all() as { discGroup: string }[];

    for (const { discGroup } of groups) {
      const existingM3u = await db.select().from(uploadedRoms)
        .where(and(eq(uploadedRoms.discGroup, discGroup), eq(uploadedRoms.isPlaylist, true)))
        .get();
      if (existingM3u) continue;

      const siblings = await db.select().from(uploadedRoms)
        .where(and(
          eq(uploadedRoms.discGroup, discGroup),
          eq(uploadedRoms.isPlaylist, false),
          sql`${uploadedRoms.parentM3uId} IS NULL`,
        ))
        .orderBy(uploadedRoms.discNumber)
        .all();

      if (siblings.length < 2) continue;

      const system = siblings[0].system;
      const title = siblings[0].title;
      const m3uLines = siblings.map((s: UploadedRom) => s.originalName).join("\n");
      const m3uSlug = `${system}_m3u_${slugify(title)}_${Date.now().toString(36)}`;

      const m3uRecord = db.insert(uploadedRoms).values({
        title,
        system,
        slug: m3uSlug,
        originalName: `${title}.m3u`,
        fileName: `${m3uSlug}.m3u`,
        filePath: `${ROM_ROOT}/${system}/${m3uSlug}.m3u`,
        size: Buffer.byteLength(m3uLines, "utf8"),
        mimeType: "text/plain",
        isPlaylist: true,
        m3uContent: m3uLines,
        discNumber: null,
        discGroup: discGroup,
        parentM3uId: null,
        romHash: null,
        minutesPlayed: 0,
        createdAt: Date.now(),
      }).returning().get() as UploadedRom;

      // Link siblings to the new M3U
      for (const sib of siblings) {
        db.update(uploadedRoms).set({ parentM3uId: m3uRecord.id }).where(eq(uploadedRoms.id, sib.id)).run();
      }
    }
  }
  async listRomFilenames(): Promise<string[]> {
    const rows = db.select({ fileName: uploadedRoms.fileName }).from(uploadedRoms).all();
    return rows.map((r: any) => r.fileName);
  }
  async listActivityLog(limit = 100): Promise<any[]> { return db.select().from(activityLog).orderBy(desc(activityLog.ts)).limit(limit).all(); }
  async addActivityLogEntry(entry: any): Promise<any> { return db.insert(activityLog).values({ ...entry, ts: Date.now() }).returning().get(); }
  async clearActivityLog(): Promise<void> { db.delete(activityLog).run(); }
  async createPlaySession(romId: number, romTitle: string, romSystem: string, startedAt: number): Promise<number> {
    const result = db.insert(playSessions).values({ romId, romTitle, romSystem, startedAt }).returning().get();
    return result.id;
  }
  async endPlaySession(sessionId: number, endedAt: number, durationSeconds: number): Promise<void> {
    db.update(playSessions).set({ endedAt, durationSeconds }).where(eq(playSessions.id, sessionId)).run();
  }
  async listRecentSessions(limit = 50): Promise<any[]> {
    return db.select().from(playSessions).orderBy(desc(playSessions.startedAt)).limit(limit).all();
  }
  async getPlayStatsSummary(): Promise<any> {
    const summary = db.select({
      totalMinutes: sum(uploadedRoms.minutesPlayed),
      totalGames: count(uploadedRoms.id),
    }).from(uploadedRoms).get();
    
    const favCount = db.select({ count: count(uploadedRoms.id) })
      .from(uploadedRoms)
      .where(eq(uploadedRoms.favorite, true))
      .get();

    return { 
      totalMinutes: Number(summary?.totalMinutes || 0),
      totalGames: Number(summary?.totalGames || 0),
      favoriteCount: Number(favCount?.count || 0) 
    };
  }
  async getHallOfFame(limit = 3): Promise<UploadedRom[]> {
    return db.select().from(uploadedRoms).orderBy(desc(uploadedRoms.minutesPlayed)).limit(limit).all();
  }
  async getBiosStatus(): Promise<any> {
    const BIOS_ROOT = dataPath("bios");
    const status: any = {};
    for (const [core, files] of Object.entries(REQUIRED_BIOS)) {
      status[core] = await Promise.all(
        files.map(async (meta) => {
          const filePath = path.join(BIOS_ROOT, meta.filename);
          try {
            await fs.access(filePath);
            const buffer = await fs.readFile(filePath);
            const actualMd5 = crypto.createHash("md5").update(buffer).digest("hex");
            const isVerified = actualMd5 === meta.md5 || meta.md5 === "00000000000000000000000000000000";
            return { filename: meta.filename, exists: true, verified: isVerified, label: (meta as any).label };
          } catch {
            return { filename: meta.filename, exists: false, verified: false, label: (meta as any).label };
          }
        })
      );
    }
    return status;
  }

  // Phase 1: Storage Snapshot and Bulk Cleanup Methods

  async getDuplicateGroups(): Promise<{ romHash: string; ids: number[]; count: number }[]> {
    const groups = db.select({
      romHash: uploadedRoms.romHash,
      ids: sql`group_concat(${uploadedRoms.id})`,
      count: sql`count(*)`,
    }).from(uploadedRoms)
      .where(sql`${uploadedRoms.romHash} IS NOT NULL`)
      .groupBy(uploadedRoms.romHash)
      .having(sql`count(*) > 1`)
      .all();

    return groups.map((g: any) => ({
      romHash: g.romHash,
      ids: g.ids ? g.ids.split(",").map(Number) : [],
      count: g.count
    })) as any;
  }

  async countUnplayedRoms(system?: string): Promise<number> {
    const query = db.select({ count: sql<number>`count(*)` }).from(uploadedRoms)
      .where(sql`(${uploadedRoms.minutesPlayed} IS NULL OR ${uploadedRoms.minutesPlayed} = 0)`);

    if (system) {
      query.where(and(eq(uploadedRoms.system, system), sql`(${uploadedRoms.minutesPlayed} IS NULL OR ${uploadedRoms.minutesPlayed} = 0)`));
    }

    const row = query.get();
    return row?.count ?? 0;
  }

  async countFailedScrapes(): Promise<number> {
    const row = db.select({ count: sql<number>`count(*)` }).from(uploadedRoms)
      .where(eq(uploadedRoms.scrapeStatus, "failed"))
      .get();
    return row?.count ?? 0;
  }

  async deleteRomsBySystem(system: string): Promise<{ deletedCount: number }> {
    const roms = await this.listRomsBySystem(system);
    const deletedCount = roms.length;

    for (const rom of roms) {
      await this.deleteUploadedRom(rom.id);
    }

    return { deletedCount };
  }

  async deleteDuplicateRoms(): Promise<{ deletedCount: number; keptCount: number }> {
    const groups = await this.getDuplicateGroups();
    let deletedCount = 0;
    let keptCount = 0;

    for (const group of groups) {
      if (group.ids.length <= 1) continue;
      const [idToKeep] = group.ids;
      for (let i = 1; i < group.ids.length; i++) {
        const idToDelete = group.ids[i];
        await this.deleteUploadedRom(idToDelete);
        deletedCount++;
      }
      keptCount++;
    }

    return { deletedCount, keptCount };
  }

  async deleteUnplayedRoms(system?: string): Promise<{ deletedCount: number }> {
    const roms = await this.listUploadedRoms();
    const toDelete = roms.filter(rom => {
      const isUnplayed = rom.minutesPlayed == null || rom.minutesPlayed === 0;
      return system ? isUnplayed && rom.system === system : isUnplayed;
    });

    for (const rom of toDelete) {
      await this.deleteUploadedRom(rom.id);
    }

    return { deletedCount: toDelete.length };
  }

  async deleteFailedScrapes(): Promise<{ deletedCount: number }> {
    const roms = await this.listUploadedRoms();
    const toDelete = roms.filter(rom => rom.scrapeStatus === "failed");

    for (const rom of toDelete) {
      await this.deleteUploadedRom(rom.id);
    }

    return { deletedCount: toDelete.length };
  }

  async listRomsBySystem(system: string): Promise<UploadedRom[]> {
    return db.select().from(uploadedRoms).where(eq(uploadedRoms.system, system)).all();
  }

  async getStorageSnapshot(): Promise<StorageSnapshot> {
    const roms = await this.listUploadedRoms();
    log(`Storage snapshot: processing ${roms.length} ROMs`, "storage");
    const settings = await this.getIntegrationSettings();
    const watchPaths = (settings.libraryWatchPaths ?? "")
      .split(",")
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);
    log(`Storage snapshot: ${watchPaths.length} watch paths`, "storage");

    let romStorageSize = 0;
    const bySystem = await this.getRomMoveStats().then(stats => stats.systems);

    let statErrors = 0;
    for (const rom of roms) {
      const absPath = getAbsoluteFilePath(rom, watchPaths);
      try {
        const stat = await fs.stat(absPath);
        romStorageSize += stat.size;
      } catch {
        statErrors++;
      }
    }
    if (statErrors > 0) log(`Storage snapshot: ${statErrors} ROMs had no file on disk`, "storage");

    const romStorage: StorageSnapshot["romStorage"] = {
      path: ROM_ROOT,
      usedBytes: romStorageSize,
      disk: null,
    };

    const watchPathsSnapshot: StorageSnapshot["watchPaths"] = await Promise.all(
      watchPaths.map(async (watchPath) => {
        let count = 0;
        let size = 0;

        try {
          const entries = await fs.readdir(watchPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(watchPath, entry.name);
            if (entry.isDirectory()) {
              const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
              count += subEntries.length;
              size += await this.getDirectorySize(fullPath);
            } else {
              count++;
              const entryStat = (entry as any).stat;
              size += entryStat ? entryStat.size : await fs.stat(fullPath).then(s => s.size);
            }
          }
        } catch {
          log(`Storage snapshot: could not read watch path ${watchPath}`, "storage");
        }

        return { path: watchPath, count, size, imported: 0 };
      })
    );

    const cachePath = path.join(SAVE_BACKUP_DIR, "system-image-cache");
    let cacheSize = 0;
    try {
      cacheSize = await this.getDirectorySize(cachePath);
    } catch {
      log(`Storage snapshot: could not read cache path ${cachePath}`, "storage");
    }

    const systemImageCache: StorageSnapshot["systemImageCache"] = {
      path: cachePath,
      size: cacheSize
    };

    log(`Storage snapshot: totalSize=${romStorageSize} bytes, ${bySystem.length} systems, ${watchPathsSnapshot.length} watch paths, cache=${cacheSize} bytes`, "storage");

    return {
      totalRoms: roms.length,
      totalSize: bySystem.reduce((acc, sys) => acc + sys.size, 0),
      bySystem,
      romStorage,
      watchPaths: watchPathsSnapshot,
      systemImageCache,
    };
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subDirSize = await this.getDirectorySize(fullPath);
        size += subDirSize;
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        } catch {}
      }
    }

    return size;
  }

  async deleteRomFilesBySystem(system: string): Promise<{ deleted: number; failed: number }> {
    const settings = await this.getIntegrationSettings();
    const watchPaths = (settings.libraryWatchPaths ?? "")
      .split(",")
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);

    const roms = await this.listRomsBySystem(system);
    let deleted = 0;
    let failed = 0;

    for (const rom of roms) {
      const resolvedPath = getAbsoluteFilePath(rom, watchPaths);
      try {
        await fs.unlink(resolvedPath);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }

  async deleteDuplicateFiles(): Promise<{ deleted: number; failed: number }> {
    const groups = await this.getDuplicateGroups();
    let deleted = 0;
    let failed = 0;

    for (const group of groups) {
      if (group.ids.length <= 1) continue;

      for (let i = 1; i < group.ids.length; i++) {
        const rom = await this.getUploadedRom(group.ids[i]);
        if (!rom) continue;

        const settings = await this.getIntegrationSettings();
        const watchPaths = (settings.libraryWatchPaths ?? "")
          .split(",")
          .map((p) => path.resolve(p.trim()))
          .filter(Boolean);
        const resolvedPath = getAbsoluteFilePath(rom, watchPaths);

        try {
          await fs.unlink(resolvedPath);
          deleted++;
        } catch {
          failed++;
        }
      }
    }

    return { deleted, failed };
  }

  async deleteUnplayedFiles(system?: string): Promise<{ deleted: number; failed: number }> {
    const settings = await this.getIntegrationSettings();
    const watchPaths = (settings.libraryWatchPaths ?? "")
      .split(",")
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);

    const roms = await this.listUploadedRoms();
    const toDelete = roms.filter(rom => {
      const isUnplayed = rom.minutesPlayed == null || rom.minutesPlayed === 0;
      return system ? isUnplayed && rom.system === system : isUnplayed;
    });

    let deleted = 0;
    let failed = 0;

    for (const rom of toDelete) {
      const resolvedPath = getAbsoluteFilePath(rom, watchPaths);
      try {
        await fs.unlink(resolvedPath);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }

  async deleteFailedFiles(): Promise<{ deleted: number; failed: number }> {
    const settings = await this.getIntegrationSettings();
    const watchPaths = (settings.libraryWatchPaths ?? "")
      .split(",")
      .map((p) => path.resolve(p.trim()))
      .filter(Boolean);

    const roms = await this.listUploadedRoms();
    const failedRoms = roms.filter(rom => rom.scrapeStatus === "failed");

    let deleted = 0;
    let failed = 0;

    for (const rom of failedRoms) {
      const resolvedPath = getAbsoluteFilePath(rom, watchPaths);
      try {
        await fs.unlink(resolvedPath);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }
}

export const storage = new DatabaseStorage();
