/**
 * AutomationsSettings — Home Assistant Automations tab.
 * Lets users enable HA entity publishing and shows the entity reference
 * and example automation YAML they can copy into HA.
 */
import React, { useState } from "react";
import { useIntegration } from "@/lib/integration";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, Field } from "./SettingsShared";
import {
  Zap, CheckCircle2, XCircle, Loader2, Copy, Check,
  Radio, Gamepad2, Monitor, User, Clock, Hash, Settings2,
  Cpu, MemoryStick, Activity
} from "lucide-react";

// ── Entity reference ──────────────────────────────────────────────────────────

const ENTITIES = [
  {
    id: "binary_sensor.homearcade_active",
    icon: Radio,
    type: "Binary Sensor",
    description: "on while a game is running, off when idle",
    example: "on / off",
  },
  {
    id: "sensor.homearcade_game",
    icon: Gamepad2,
    type: "Sensor",
    description: "Title of the current game, or 'idle'",
    example: "Super Mario Bros. 3",
  },
  {
    id: "sensor.homearcade_system",
    icon: Monitor,
    type: "Sensor",
    description: "Console system ID in uppercase",
    example: "NES",
  },
  {
    id: "sensor.homearcade_player",
    icon: User,
    type: "Sensor",
    description: "Active profile name",
    example: "Player 1",
  },
  {
    id: "sensor.homearcade_session_start",
    icon: Clock,
    type: "Sensor (timestamp)",
    description: "ISO timestamp when the current session started",
    example: "2026-05-20T19:00:00Z",
  },
  {
    id: "sensor.homearcade_play_count",
    icon: Hash,
    type: "Sensor",
    description: "Total play count for the current game",
    example: "42",
  },
];

// ── Example automations ───────────────────────────────────────────────────────

const EXAMPLES = [
  {
    title: "Console-matched RGB lighting",
    yaml: `automation:
  alias: "HomeArcade — Ambient console lighting"
  trigger:
    - platform: state
      entity_id: binary_sensor.homearcade_active
      to: "on"
  action:
    - choose:
        - conditions:
            - condition: state
              entity_id: sensor.homearcade_system
              state: "NES"
          sequence:
            - service: light.turn_on
              target:
                entity_id: light.arcade_lights
              data:
                rgb_color: [255, 0, 0]
                brightness: 180
        - conditions:
            - condition: state
              entity_id: sensor.homearcade_system
              state: "SNES"
          sequence:
            - service: light.turn_on
              target:
                entity_id: light.arcade_lights
              data:
                rgb_color: [128, 0, 255]
                brightness: 180
        - conditions:
            - condition: state
              entity_id: sensor.homearcade_system
              state: "GENESIS"
          sequence:
            - service: light.turn_on
              target:
                entity_id: light.arcade_lights
              data:
                rgb_color: [0, 100, 255]
                brightness: 180
        - conditions:
            - condition: state
              entity_id: sensor.homearcade_system
              state: "PS1"
          sequence:
            - service: light.turn_on
              target:
                entity_id: light.arcade_lights
              data:
                rgb_color: [180, 180, 200]
                brightness: 180
      default:
        - service: light.turn_on
          target:
            entity_id: light.arcade_lights
          data:
            rgb_color: [236, 72, 153]
            brightness: 180`,
  },
  {
    title: "Turn on Smart Plug & switch TV HDMI",
    yaml: `automation:
  alias: "HomeArcade — Switch TV to gaming input"
  trigger:
    - platform: state
      entity_id: binary_sensor.homearcade_active
      to: "on"
  action:
    - service: switch.turn_on
      target:
        entity_id: switch.arcade_power_plug
    - service: media_player.turn_on
      target:
        entity_id: media_player.living_room_tv
    - service: media_player.select_source
      target:
        entity_id: media_player.living_room_tv
      data:
        source: "HDMI 1"`,
  },
  {
    title: "Restore lights & standby when game ends",
    yaml: `automation:
  alias: "HomeArcade — Restore scene"
  trigger:
    - platform: state
      entity_id: binary_sensor.homearcade_active
      to: "off"
  action:
    - service: scene.turn_on
      target:
        entity_id: scene.living_room_normal`,
  },
  {
    title: "Notify summary on session completed (Event)",
    yaml: `automation:
  alias: "HomeArcade — Session completion alert"
  trigger:
    - platform: event
      event_type: homearcade_game_ended
  action:
    - service: notify.notify
      data:
        title: "Arcade Session Ended"
        message: >
          {{ trigger.event.data.profile }} played {{ trigger.event.data.game }}
          ({{ trigger.event.data.system }}) for {{ trigger.event.data.duration_minutes }} min!`,
  },
  {
    title: "Notify after 2 hours of continuous play",
    yaml: `automation:
  alias: "HomeArcade — Long session alert"
  trigger:
    - platform: state
      entity_id: binary_sensor.homearcade_active
      to: "on"
      for:
        hours: 2
  action:
    - service: notify.mobile_app
      data:
        message: >
          You've been playing {{ states('sensor.homearcade_game') }} for 2 hours! Time for a break.`,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AutomationsSettings() {
  const { config, setConfig } = useIntegration();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleTestPing = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl("/api/ha/test-ping"), { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      setTestResult(data);
      if (data.ok) {
        toast({ title: "Connection successful", description: "sensor.homearcade_test was created in HA." });
      } else {
        toast({ variant: "destructive", title: "Connection failed", description: data.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setTestResult({ ok: false, error: msg });
      toast({ variant: "destructive", title: "Connection failed", description: msg });
    } finally {
      setTesting(false);
    }
  };

  const handlePushInitial = async () => {
    setPushing(true);
    try {
      const res = await fetch(apiUrl("/api/ha/push-initial"), { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        toast({ title: "Entities pushed", description: "All HomeArcade entities were sent to HA." });
      } else {
        toast({ variant: "destructive", title: "Push failed", description: data.error });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Push failed", description: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPushing(false);
    }
  };

  const copyYaml = (yaml: string, idx: number) => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  return (
    <div className="space-y-10">

      {/* ── Enable publishing ──────────────────────────────────────────────── */}
      <Section
        title="HA Entity Publishing"
        description="Push live game state to Home Assistant as sensor entities. No manual token needed — uses the add-on Supervisor token automatically."
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-sidebar/40">
            <div className="space-y-0.5">
              <div className="font-display font-semibold text-sm flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                Publish entities to Home Assistant
              </div>
              <div className="text-xs text-muted-foreground">
                Automatically updates sensor states when a game starts or ends.
              </div>
            </div>
            <Switch
              checked={!!config.haPublishEntities}
              onCheckedChange={(v) => setConfig({ haPublishEntities: v })}
            />
          </div>

          {/* Manual Connection Overrides */}
          <div className="rounded-xl border border-border bg-sidebar/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60 bg-sidebar/20 flex items-center gap-2">
              <Settings2 className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Manual Configuration (Optional)</span>
            </div>
            <div className="p-4 grid sm:grid-cols-2 gap-6">
              <Field label="Home Assistant URL" hint="Only needed if running outside of HA Add-on environment.">
                <Input
                  value={config.haBaseUrl}
                  onChange={(e) => setConfig({ haBaseUrl: e.target.value })}
                  placeholder="https://homeassistant.local:8123"
                  className="font-mono text-sm"
                />
              </Field>
              <Field label="Long-Lived Access Token" hint="Generate this in your HA profile settings.">
                <Input
                  type="password"
                  value={config.haToken}
                  onChange={(e) => setConfig({ haToken: e.target.value })}
                  placeholder="Paste token here..."
                  className="font-mono text-sm"
                />
              </Field>
            </div>
          </div>

          {/* Test connection & Force Push */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleTestPing}
              disabled={testing || pushing}
            >
              {testing
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Radio className="size-3.5" />}
              Test connection
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handlePushInitial}
              disabled={testing || pushing}
            >
              {pushing
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Zap className="size-3.5" />}
              Push initial entities
            </Button>

            {testResult !== null && (
              <div className={[
                "flex items-center gap-1.5 text-xs font-mono",
                testResult.ok ? "text-green-500" : "text-destructive",
              ].join(" ")}>
                {testResult.ok
                  ? <CheckCircle2 className="size-3.5" />
                  : <XCircle className="size-3.5" />}
                {testResult.ok ? "Connected — sensor.homearcade_test created" : testResult.error}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── PC Sensors ────────────────────────────────────────────────────── */}
      <Section
        title="PC Sensor Configuration"
        description="Link entities from HASS.Agent or IOT Link to show your PC's live status, CPU, and RAM on the dashboard."
      >
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
          <Field label="PC Hostname" hint="Display name for your gaming PC.">
            <div className="relative">
              <Monitor className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.pcHostname}
                onChange={(e) => setConfig({ pcHostname: e.target.value })}
                placeholder="ARCADE-PC"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>

          <Field label="Online Entity ID" hint="A binary_sensor or sensor that is 'on' when PC is active.">
            <div className="relative">
              <Activity className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.pcOnlineEntityId}
                onChange={(e) => setConfig({ pcOnlineEntityId: e.target.value })}
                placeholder="binary_sensor.my_pc_active"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>

          <Field label="CPU Usage Entity ID" hint="Sensor providing 0-100 percentage.">
            <div className="relative">
              <Cpu className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.pcCpuEntityId}
                onChange={(e) => setConfig({ pcCpuEntityId: e.target.value })}
                placeholder="sensor.my_pc_cpu_load"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>

          <Field label="RAM Usage Entity ID" hint="Sensor providing 0-100 percentage.">
            <div className="relative">
              <MemoryStick className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.pcRamEntityId}
                onChange={(e) => setConfig({ pcRamEntityId: e.target.value })}
                placeholder="sensor.my_pc_memory_usage"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>

          <Field label="Current App Entity ID" hint="Sensor showing the active window title.">
            <div className="relative">
              <Gamepad2 className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={config.pcAppEntityId}
                onChange={(e) => setConfig({ pcAppEntityId: e.target.value })}
                placeholder="sensor.my_pc_active_window"
                className="pl-9 font-mono text-sm"
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* ── Entity reference ───────────────────────────────────────────────── */}
      <Section
        title="Entity Reference"
        description="These entities are created automatically in Home Assistant when publishing is enabled. Use them in automations, dashboards, and scripts."
      >
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {ENTITIES.map((entity) => {
            const Icon = entity.icon;
            return (
              <div key={entity.id} className="flex items-start gap-4 px-4 py-3 bg-sidebar/10 hover:bg-sidebar/20 transition-colors">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs font-bold text-foreground">{entity.id}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{entity.description}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{entity.type}</div>
                  <div className="font-mono text-[11px] text-primary/80 mt-0.5">{entity.example}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Attributes like <code className="font-mono bg-muted/40 px-1 rounded">genre</code>, <code className="font-mono bg-muted/40 px-1 rounded">developer</code>, <code className="font-mono bg-muted/40 px-1 rounded">release_year</code>, and <code className="font-mono bg-muted/40 px-1 rounded">art_url</code> are available on <code className="font-mono bg-muted/40 px-1 rounded">sensor.homearcade_game</code>.
        </p>
      </Section>

      {/* ── Example automations ────────────────────────────────────────────── */}
      <Section
        title="Example Automations"
        description="Copy these into your automations.yaml or paste them in the HA automation editor."
      >
        <div className="space-y-4">
          {EXAMPLES.map((ex, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-sidebar/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <span className="text-sm font-semibold">{ex.title}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => copyYaml(ex.yaml, idx)}
                >
                  {copiedIdx === idx
                    ? <><Check className="size-3 text-green-500" /> Copied</>
                    : <><Copy className="size-3" /> Copy</>}
                </Button>
              </div>
              <pre className="px-4 py-3 text-[11px] font-mono text-muted-foreground overflow-x-auto scrollbar-none leading-relaxed">
                {ex.yaml}
              </pre>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
