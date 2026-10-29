/**
 * DisplaySettings — Interface & Layout tab content for Settings page.
 */
import React from "react";
import { useIntegration } from "@/lib/integration";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Monitor } from "lucide-react";
import { Section, Field } from "./SettingsShared";
import { THEMES } from "@/lib/themes";

const ALL_SYSTEMS = [
  { id: "nes", label: "NES" }, { id: "snes", label: "SNES" },
  { id: "genesis", label: "Genesis" }, { id: "n64", label: "N64" },
  { id: "gb", label: "GB" }, { id: "gbc", label: "GBC" },
  { id: "gba", label: "GBA" }, { id: "nds", label: "NDS" },
  { id: "ps1", label: "PS1" }, { id: "ps2", label: "PS2" },
  { id: "psp", label: "PSP" }, { id: "dreamcast", label: "DC" },
  { id: "arcade", label: "Arcade" },
];

export function DisplaySettings() {
  const { config, setConfig } = useIntegration();
  const { t } = useTranslation();

  return (
    <div className="space-y-10">
      <Section
        title={t("settings.sections.display.title")}
        description={t("settings.sections.display.description")}
        defaultOpen={true}
      >
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label={t("settings.fields.language.label")} hint={t("settings.fields.language.hint")}>
            <Select value={config.language ?? "en"} onValueChange={(val) => setConfig({ language: val })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("languages.en")}</SelectItem>
                <SelectItem value="es">{t("languages.es")}</SelectItem>
                <SelectItem value="fr">{t("languages.fr")}</SelectItem>
                <SelectItem value="de">{t("languages.de")}</SelectItem>
                <SelectItem value="pt">{t("languages.pt")}</SelectItem>
                <SelectItem value="ja">{t("languages.ja")}</SelectItem>
                <SelectItem value="zh">{t("languages.zh")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Theme" hint="Select a visual color theme.">
            <Select value={config.theme ?? "default"} onValueChange={(val) => setConfig({ theme: val })}>
              <SelectTrigger data-testid="theme-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {THEMES.map((theme) => (
                  <SelectItem key={theme} value={theme}>
                    <span className="capitalize">{theme.replace("-", " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={t("settings.fields.systemLabels.label")} hint={t("settings.fields.systemLabels.hint")}>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-sidebar/40 h-10 mt-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{t("settings.fields.systemLabels.show")}</span>
              <Switch checked={config.showSystemLabels} onCheckedChange={(v) => setConfig({ showSystemLabels: v })} />
            </div>
          </Field>



          <Field label={t("settings.fields.aspectRatio.label")} hint={t("settings.fields.aspectRatio.hint")}>
            <Select value={config.globalAspectRatio || "auto"} onValueChange={(v) => setConfig({ globalAspectRatio: v })}>
              <SelectTrigger><SelectValue placeholder={t("settings.fields.aspectRatio.placeholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("settings.fields.aspectRatio.placeholder")} ({t("common.ui.reset")})</SelectItem>
                <SelectItem value="4/3">4:3</SelectItem>
                <SelectItem value="16/9">16:9</SelectItem>
                <SelectItem value="3/2">3:2</SelectItem>
                <SelectItem value="8/7">8:7</SelectItem>
                <SelectItem value="1/1">1:1</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label={t("settings.fields.shader.label")} hint={t("settings.fields.shader.hint")}>
            <Select value={config.globalShader || "none"} onValueChange={(v) => setConfig({ globalShader: v })}>
              <SelectTrigger><SelectValue placeholder={t("settings.fields.shader.placeholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("settings.fields.shader.placeholder")}</SelectItem>
                <SelectItem value="crt">CRT</SelectItem>
                <SelectItem value="smooth">Smooth</SelectItem>
                <SelectItem value="scanlines">Scanlines</SelectItem>
                <SelectItem value="lcd">LCD</SelectItem>
                <SelectItem value="phosphor">Phosphor</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field 
            label="Motore di Gioco & Streaming Nativo" 
            hint="Configura il motore di gioco: lo Streaming Nativo WebRTC esegue Libretro a 60 FPS direttamente su Home Assistant con latenza ultra-bassa, audio Opus sincronizzato, salvataggi istantanei e multiplayer. Con EmulatorJS disattivato i giochi partono sempre sul motore nativo senza richiedere il caricamento della ROM nel browser."
          >
            <Select 
              value={config.wasmMode || "disabled"} 
              onValueChange={(val: "always" | "fallback" | "disabled") => setConfig({ wasmMode: val })}
            >
              <SelectTrigger data-testid="select-wasm-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Streaming Nativo WebRTC (Consigliato: 60 FPS, EmulatorJS disattivato)</SelectItem>
                <SelectItem value="fallback">Streaming Nativo con fallback browser di emergenza</SelectItem>
                <SelectItem value="always">Solo Browser Web (Legacy EmulatorJS)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      <Section
        title={t("settings.sections.overrides.title")}
        description={t("settings.sections.overrides.description")}
      >
        <div className="space-y-3">
          {ALL_SYSTEMS.map((system) => {
            const display = config.systemDisplay?.[system.id] || {};
            const update = (patch: Partial<NonNullable<typeof config.systemDisplay>[string]>) => {
              const next = { ...config.systemDisplay };
              next[system.id] = { ...display, ...patch };
              setConfig({ systemDisplay: next });
            };
            return (
              <div key={system.id} className="p-4 rounded-lg border border-border bg-sidebar/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-display font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                    <Monitor className="size-3.5 text-primary" />
                    {system.label}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] uppercase font-mono text-muted-foreground hover:text-destructive"
                    onClick={() => { const next = { ...config.systemDisplay }; delete next[system.id]; setConfig({ systemDisplay: next }); }}
                    disabled={!config.systemDisplay?.[system.id]}>
                    {t("common.ui.reset")}
                  </Button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">{t("settings.fields.aspectRatio.label")}</span>
                    <Select value={display.aspectRatio || "auto"} onValueChange={(v) => update({ aspectRatio: v === "auto" ? undefined : v })}>
                      <SelectTrigger className="h-8 text-xs bg-background/40"><SelectValue placeholder={t("settings.fields.aspectRatio.placeholder")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t("settings.fields.aspectRatio.placeholder")} ({t("common.ui.reset")})</SelectItem>
                        <SelectItem value="4/3">4:3</SelectItem>
                        <SelectItem value="16/9">16:9</SelectItem>
                        <SelectItem value="3/2">3:2</SelectItem>
                        <SelectItem value="8/7">8:7</SelectItem>
                        <SelectItem value="1/1">1:1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">{t("settings.fields.shader.label")}</span>
                    <Select value={display.shader || "none"} onValueChange={(v) => update({ shader: v === "none" ? undefined : v })}>
                      <SelectTrigger className="h-8 text-xs bg-background/40"><SelectValue placeholder={t("settings.fields.shader.placeholder")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("settings.fields.shader.placeholder")}</SelectItem>
                        <SelectItem value="crt">CRT</SelectItem>
                        <SelectItem value="smooth">Smooth</SelectItem>
                        <SelectItem value="scanlines">Scanlines</SelectItem>
                        <SelectItem value="lcd">LCD</SelectItem>
                        <SelectItem value="phosphor">Phosphor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end pb-1">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">Integer Scale</span>
                      <Switch className="scale-75 origin-right" checked={!!display.integerScale} onCheckedChange={(v) => update({ integerScale: v })} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
