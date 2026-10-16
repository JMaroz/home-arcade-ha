import { log } from "./log";
import fs from "node:fs/promises";
import path from "node:path";
import { storage } from "./storage";

interface OneDriveTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

/**
 * Gets a fresh access token using the Microsoft OAuth2 refresh token from settings.
 */
export async function getAccessToken(): Promise<string> {
  const settings = await storage.getIntegrationSettings();
  if (!settings.oneDriveRefreshToken || !settings.oneDriveClientId) {
    throw new Error("OneDrive credentials incomplete in Settings (Client ID and Refresh Token required).");
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken;
  }

  log("Refreshing OneDrive access token...", "onedrive");
  const params = new URLSearchParams({
    client_id: settings.oneDriveClientId,
    refresh_token: settings.oneDriveRefreshToken,
    grant_type: "refresh_token",
    scope: "Files.ReadWrite offline_access",
  });

  if (settings.oneDriveClientSecret) {
    params.set("client_secret", settings.oneDriveClientSecret);
  }

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to refresh OneDrive token: ${errText || res.statusText}`);
  }

  const data = (await res.json()) as OneDriveTokenResponse;
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  // If a new refresh token was issued, persist it
  if (data.refresh_token && data.refresh_token !== settings.oneDriveRefreshToken) {
    await storage.saveIntegrationSettings({
      ...settings,
      oneDriveRefreshToken: data.refresh_token,
    });
  }

  return cachedAccessToken;
}

/**
 * Tests connection to Microsoft Graph API and verifies account access.
 */
export async function testOneDriveConnection(): Promise<{ success: boolean; user?: string; message?: string }> {
  try {
    const token = await getAccessToken();
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, message: `OneDrive API returned status ${res.status}: ${err}` };
    }
    const data = (await res.json()) as { displayName?: string; userPrincipalName?: string };
    const user = data.displayName || data.userPrincipalName || "Connected User";
    return { success: true, user };
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) };
  }
}

/**
 * Uploads a file to the 'HomeArcade_Saves' directory on OneDrive.
 */
export async function uploadToOneDrive(localPath: string, remoteFileName: string): Promise<boolean> {
  const token = await getAccessToken();
  const fileContent = await fs.readFile(localPath);

  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/HomeArcade_Saves/${encodeURIComponent(remoteFileName)}:/content`;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: fileContent,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OneDrive upload failed (${res.status}): ${errText}`);
  }

  log(`Uploaded ${remoteFileName} to OneDrive (${fileContent.length} bytes)`, "onedrive");
  return true;
}

/**
 * Downloads a file from the 'HomeArcade_Saves' directory on OneDrive if newer than local.
 */
export async function downloadFromOneDrive(remoteFileName: string, localPath: string): Promise<boolean> {
  const token = await getAccessToken();

  // Check remote item metadata
  const metaUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/HomeArcade_Saves/${encodeURIComponent(remoteFileName)}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) return false;

  const metaData = (await metaRes.json()) as { lastModifiedDateTime?: string; id?: string };
  if (!metaData.lastModifiedDateTime) return false;

  try {
    const localStat = await fs.stat(localPath);
    const remoteTime = new Date(metaData.lastModifiedDateTime).getTime();
    if (localStat.mtimeMs >= remoteTime) {
      return false; // Local is newer or up to date
    }
  } catch {
    // Local file does not exist, download
  }

  const contentUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/HomeArcade_Saves/${encodeURIComponent(remoteFileName)}:/content`;
  const downloadRes = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!downloadRes.ok) return false;

  const buf = Buffer.from(await downloadRes.arrayBuffer());
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buf);
  log(`Downloaded newer ${remoteFileName} from OneDrive (${buf.length} bytes)`, "onedrive");
  return true;
}

/**
 * Synchronizes save files between local SAVE_BACKUP_DIR and OneDrive.
 */
export async function syncOneDriveSaves(saveDir: string): Promise<{ success: boolean; uploaded: number; downloaded: number }> {
  const roms = await storage.listUploadedRoms();

  let uploaded = 0;
  let downloaded = 0;

  const settings = await storage.getIntegrationSettings();

  for (const rom of roms) {
    const slots = await storage.listAllRomSaveSlots(rom.id);
    for (const slot of slots) {
      const localPath = path.join(saveDir, slot.userId, String(rom.id), `slot-${slot.slot}.state`);
      const remoteFileName = `${slot.userId}_${rom.id}_slot-${slot.slot}.state`;

      // 1. Try download newer version
      const wasDownloaded = await downloadFromOneDrive(remoteFileName, localPath).catch(() => false);
      if (wasDownloaded) {
        downloaded++;
        continue;
      }

      // 2. Upload local if exists
      try {
        await fs.access(localPath);
        await uploadToOneDrive(localPath, remoteFileName);
        uploaded++;
      } catch {}
    }
  }

  await storage.saveIntegrationSettings({
    ...settings,
    oneDriveLastSync: Date.now(),
  });

  return { success: true, uploaded, downloaded };
}
