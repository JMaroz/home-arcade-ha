/**
 * ServicesSettings — Online Services tab content for Settings page.
 * Covers RetroAchievements only (art uses free Libretro thumbnails).
 */
import React, { useState } from "react";
import { useIntegration } from "@/lib/integration";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trophy, Cloud, RefreshCw, Globe, Key, AlertCircle, Loader2 } from "lucide-react";
import { Section, Field } from "./SettingsShared";
import { apiRequest, apiUrl } from "@/lib/queryClient";

export function ServicesSettings() {
  const { config, setConfig } = useIntegration();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [testingDrive, setTestingDrive] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [testingOneDrive, setTestingOneDrive] = useState(false);
  const [syncingOneDrive, setSyncingOneDrive] = useState(false);

  const testDrive = async () => {
    setTestingDrive(true);
    try {
      const res = await fetch(apiUrl("/api/vault/test-drive"));
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Drive Connected", description: data.message });
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    } finally {
      setTestingDrive(false);
    }
  };

  const syncCloud = async () => {
    setSyncingCloud(true);
    try {
      const res = await apiRequest("POST", "/api/vault/cloud-sync");
      const data = await res.json();
      toast({ title: "Cloud Sync Complete", description: `Uploaded ${data.uploaded} saves and downloaded ${data.downloaded} newer versions.` });
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingCloud(false);
    }
  };

  const testOneDrive = async () => {
    setTestingOneDrive(true);
    try {
      const res = await fetch(apiUrl("/api/vault/onedrive-test"));
      const data = await res.json();
      if (data.ok) {
        toast({ title: "OneDrive Connected", description: data.message });
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      toast({ title: "OneDrive Connection Failed", description: err.message, variant: "destructive" });
    } finally {
      setTestingOneDrive(false);
    }
  };

  const syncOneDrive = async () => {
    setSyncingOneDrive(true);
    try {
      const res = await apiRequest("POST", "/api/vault/onedrive-sync");
      const data = await res.json();
      toast({ title: "OneDrive Sync Complete", description: `Uploaded ${data.uploaded} saves and downloaded ${data.downloaded} newer versions.` });
    } catch (err: any) {
      toast({ title: "OneDrive Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingOneDrive(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* ── RetroAchievements ───────────────────────────────────────────── */}
      <Section title={t("settings.sections.retroachievements.title")} description={t("settings.sections.retroachievements.description")}>
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label={t("settings.fields.raUsername.label")}>
            <div className="relative">
              <Trophy className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.raUsername}
                onChange={(e) => setConfig({ raUsername: e.target.value })}
                placeholder="RA Username"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>
          <Field label={t("settings.fields.raToken.label")} hint={t("settings.fields.raToken.hint")}>
            <Input
              type="password"
              value={config.raToken}
              onChange={(e) => setConfig({ raToken: e.target.value })}
              placeholder="RA API Key"
              className="font-mono text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* ── Cloud Sync ───────────────────────────────────────────────────── */}
      <Section title="Cloud Synchronization" description="Sync your game saves and screenshots to Google Drive to pick up where you left off on any device.">
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Cloud className="size-5 text-primary" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Google Drive Sync</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                  {config.cloudSaveEnabled ? "Active & Synchronizing" : "Disabled"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {config.cloudSaveEnabled && (
                <Button onClick={syncCloud} disabled={syncingCloud} variant="ghost" size="sm" className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px] text-primary hover:text-primary hover:bg-primary/5">
                  {syncingCloud ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Sync Now
                </Button>
              )}
              <Switch
                checked={config.cloudSaveEnabled}
                onCheckedChange={(v) => setConfig({ cloudSaveEnabled: v })}
              />
            </div>
          </div>

          {config.cloudSaveEnabled && (
            <div className="grid gap-6 p-5 rounded-xl border border-border bg-sidebar/10 animate-in slide-in-from-top-2 duration-300">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">API Credentials</div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Client ID</Label>
                      <div className="relative">
                        <Globe className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={config.googleDriveClientId}
                          onChange={(e) => setConfig({ googleDriveClientId: e.target.value })}
                          placeholder="000000000000-xxx.apps.googleusercontent.com"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Client Secret</Label>
                      <div className="relative">
                        <Key className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="password"
                          value={config.googleDriveClientSecret}
                          onChange={(e) => setConfig({ googleDriveClientSecret: e.target.value })}
                          placeholder="GOCSPX-xxxxxxxxxxxx"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Persistence</div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Refresh Token</Label>
                      <div className="relative">
                        <RefreshCw className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="password"
                          value={config.googleDriveRefreshToken}
                          onChange={(e) => setConfig({ googleDriveRefreshToken: e.target.value })}
                          placeholder="1//0xxxxxxxxxxxx"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-200/70 leading-relaxed">
                      <AlertCircle className="size-3 inline mr-1 mb-0.5" />
                      <strong>Setup Guide:</strong> Create a project in Google Cloud Console, enable Drive API, create OAuth Credentials (Web), and use an OAuth playground to get your long-lived Refresh Token.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={testDrive} disabled={testingDrive} variant="outline" size="sm" className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px]">
                  {testingDrive ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Test Connection
                </Button>
              </div>
            </div>
          )}

          {/* Microsoft OneDrive */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-sky-500/20 bg-sky-500/5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-sky-500/20 flex items-center justify-center">
                <Cloud className="size-5 text-sky-400" />
              </div>
              <div>
                <div className="font-display font-bold text-sm">Microsoft OneDrive Sync</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                  {config.oneDriveSyncEnabled ? "Active & Synchronizing" : "Disabled"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {config.oneDriveSyncEnabled && (
                <Button onClick={syncOneDrive} disabled={syncingOneDrive} variant="ghost" size="sm" className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px] text-sky-400 hover:text-sky-300 hover:bg-sky-500/10">
                  {syncingOneDrive ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Sync Now
                </Button>
              )}
              <Switch
                checked={config.oneDriveSyncEnabled}
                onCheckedChange={(v) => setConfig({ oneDriveSyncEnabled: v })}
              />
            </div>
          </div>

          {config.oneDriveSyncEnabled && (
            <div className="grid gap-6 p-5 rounded-xl border border-border bg-sidebar/10 animate-in slide-in-from-top-2 duration-300">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">API Credentials</div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Application (Client) ID</Label>
                      <div className="relative">
                        <Globe className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={config.oneDriveClientId}
                          onChange={(e) => setConfig({ oneDriveClientId: e.target.value })}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Client Secret</Label>
                      <div className="relative">
                        <Key className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="password"
                          value={config.oneDriveClientSecret}
                          onChange={(e) => setConfig({ oneDriveClientSecret: e.target.value })}
                          placeholder="Secret Value"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">OAuth Refresh Token</div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider opacity-60">Refresh Token</Label>
                      <div className="relative">
                        <RefreshCw className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="password"
                          value={config.oneDriveRefreshToken}
                          onChange={(e) => setConfig({ oneDriveRefreshToken: e.target.value })}
                          placeholder="M.R3_BL2.-xxxx"
                          className="pl-9 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-200/80 leading-relaxed">
                      <AlertCircle className="size-3 inline mr-1 mb-0.5" />
                      <strong>Setup Guide:</strong> Register an app in Microsoft Azure Portal (Entra ID), grant <code>Files.ReadWrite</code> and <code>offline_access</code> permissions, and configure your OAuth2 refresh token.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={testOneDrive} disabled={testingOneDrive} variant="outline" size="sm" className="gap-2 h-9 px-4 font-black uppercase tracking-wider text-[10px] border-sky-500/30 text-sky-400 hover:bg-sky-500/10">
                  {testingOneDrive ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Test OneDrive Connection
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
