/**
 * Settings — Main settings page shell.
 * Tab content is split into focused sub-components under ./settings/.
 * Redesigned for a categorized sidebar (desktop) and dropdown (mobile).
 */
import React, { useState } from "react";
import { Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/lib/integration";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Check, RotateCcw, ShieldAlert, Loader2,
  Palette, Gamepad2, Database, Activity, Wifi, HelpCircle, Zap,
  Layers, Sparkles, Link2, Settings2, Cpu, BarChart3
} from "lucide-react";
import { DisplaySettings } from "./settings/DisplaySettings";
import { ControlsSettings } from "./settings/ControlsSettings";
import { GamesStorageSettings } from "./settings/GamesStorageSettings";
import { ServicesSettings } from "./settings/ServicesSettings";
import { AutomationsSettings } from "./settings/AutomationsSettings";
import { PlayStats } from "@/components/PlayStats";
import { NetplaySettings } from "./settings/NetplaySettings";

import { BiosManager } from "@/components/BiosManager";
import { openSetupWizard } from "@/components/SetupWizardDialog";
import { Step, Code } from "./settings/SettingsShared";

// ── Category Configuration ───────────────────────────────────────────────────

const GROUPS = [
  {
    id: "experience",
    label: "Experience",
    icon: Sparkles,
    tabs: [
      { id: "display", label: "Interface", icon: Palette },
      { id: "controls", label: "Input", icon: Gamepad2 },
      { id: "netplay", label: "Multiplayer", icon: Wifi },
    ]
  },
  {
    id: "library",
    label: "Library",
    icon: Layers,
    tabs: [
      { id: "library", label: "Games & Storage", icon: Database },
      { id: "health", label: "Firmware", icon: Activity },
    ]
  },
  {
    id: "connectivity",
    label: "Connectivity",
    icon: Link2,
    tabs: [
      { id: "services", label: "Online Services", icon: Wifi },
      { id: "automations", label: "Automations", icon: Zap },
    ]
  },
  {
    id: "system",
    label: "System",
    icon: Settings2,
    tabs: [
      { id: "help", label: "Help & Support", icon: HelpCircle },
      { id: "stats", label: "Stats", icon: BarChart3 },
    ]
  }
];

const ALL_TABS = GROUPS.flatMap(g => g.tabs);

export default function Settings() {
  const { resetConfig, saveStatus } = useIntegration();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("display");

  const handleReset = () => {
    if (confirm(t("common.reset") + "?")) {
      resetConfig();
      toast({ title: "Settings reset", description: "Integration defaults restored." });
    }
  };

  const currentTab = ALL_TABS.find(t => t.id === activeTab) || ALL_TABS[0];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 overflow-hidden bg-[#0a0a0f] font-sans">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col md:flex-row w-full h-full min-h-0 overflow-hidden">
        
        {/* ── Left Sidebar (Desktop Only) ─────────────────────────────────── */}
        <aside className="hidden md:flex flex-col w-64 border-r border-white/5 bg-[#0f0f14] shrink-0 p-6 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-1 mb-8 px-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80">Control Panel</div>
            <h1 className="font-display text-2xl font-black tracking-tight text-foreground">Settings</h1>
          </div>

          <nav className="flex-1 space-y-8">
            {GROUPS.map((group) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                  <group.icon className="size-3" />
                  {group.label}
                </div>
                <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-0.5">
                  {group.tabs.map((tab) => (
                    <TabsTrigger 
                      key={tab.id} 
                      value={tab.id}
                      className="w-full justify-start gap-3 py-2.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:text-foreground hover:bg-white/5"
                    >
                      <tab.icon className="size-4 shrink-0" />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ))}
          </nav>

          <div className="pt-6 border-t border-white/5 mt-auto px-2 space-y-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
               {saveStatus === "saving" ? (
                 <><Loader2 className="size-3 animate-spin text-primary" /> {t("common.saveStatus.saving")}</>
               ) : saveStatus === "saved" ? (
                 <><Check className="size-3 text-accent" /> {t("common.saveStatus.saved")}</>
               ) : (
                 <><ShieldAlert className="size-3 text-muted-foreground/40" /> {t("settings.autoSaved")}</>
               )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openSetupWizard}
              className="w-full justify-start px-2.5 text-primary hover:text-primary hover:bg-primary/10 gap-2 text-[10px] uppercase font-bold tracking-widest border-primary/20 bg-primary/5"
            >
              <Sparkles className="size-3" /> Setup Wizard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}
              className="w-full justify-start px-0 text-destructive/60 hover:text-destructive hover:bg-destructive/5 gap-2 text-[10px] uppercase font-bold tracking-widest">
              <RotateCcw className="size-3" /> {t("settings.buttons.resetDefaults")}
            </Button>
          </div>
        </aside>

        {/* ── Main Content Area ────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden bg-background/20 relative">
          
          {/* Mobile Category Dropdown (Sticky Top) */}
          <header className="md:hidden flex flex-col shrink-0 p-4 border-b border-white/5 bg-[#0f0f14]/80 backdrop-blur-md sticky top-0 z-20 gap-4">
            <div className="flex items-center justify-between">
               <h1 className="font-display text-xl font-black tracking-tight">Settings</h1>
               <div className="flex items-center gap-2">
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={openSetupWizard}
                   className="h-8 gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary border-primary/30 bg-primary/5"
                 >
                   <Sparkles className="size-3" /> Wizard
                 </Button>
                 {saveStatus === "saving" && <Loader2 className="size-4 animate-spin text-primary" />}
               </div>
            </div>
            
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="h-12 bg-white/5 border-white/10 rounded-xl px-4 font-bold text-xs uppercase tracking-wider focus:ring-primary/40">
                <div className="flex items-center gap-3">
                   <currentTab.icon className="size-4 text-primary" />
                   <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1f] border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                {GROUPS.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 py-2 px-4 border-b border-white/5 bg-white/[0.02]">
                      {group.label}
                    </SelectLabel>
                    {group.tabs.map((tab) => (
                      <SelectItem 
                        key={tab.id} 
                        value={tab.id} 
                        className="py-3 px-4 focus:bg-primary/20 focus:text-primary transition-colors text-xs font-bold uppercase tracking-wide"
                      >
                        <div className="flex items-center gap-3">
                           <tab.icon className="size-4" />
                           {tab.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </header>

          <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-8 py-8 md:py-12">
            <div className="max-w-3xl mx-auto w-full space-y-10 pb-36">
              
              {/* Header Title (Shows on both Mobile/Desktop inside scroll area) */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary mb-1">
                   {GROUPS.find(g => g.tabs.some(t => t.id === activeTab))?.label || "General"}
                </div>
                <h2 className="font-display text-2xl font-black tracking-tight">{currentTab.label}</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                  {activeTab === "display" && "Language, Layout, and Visual Shaders."}
                  {activeTab === "controls" && "Input calibration and key remapping."}
                  {activeTab === "library" && "Cloud sources, ROM storage, disk space, and game management."}
                  {activeTab === "health" && "BIOS firmware status and verification."}
                  {activeTab === "services" && "RetroAchievements, metadata scrapers, and cloud sync."}
                  {activeTab === "netplay" && "Nickname and multiplayer hosting options."}
                  {activeTab === "automations" && "Home Assistant entities and game state triggers."}
                  {activeTab === "help" && "Setup guides and integration snippets."}
                  {activeTab === "stats" && "Play time statistics and recent sessions."}
                </p>
              </div>

              {/* Tab Contents */}
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <TabsContent value="display" className="m-0 focus-visible:outline-none"><DisplaySettings /></TabsContent>
                <TabsContent value="controls" className="m-0 focus-visible:outline-none"><ControlsSettings /></TabsContent>
                <TabsContent value="library" className="m-0 focus-visible:outline-none"><GamesStorageSettings /></TabsContent>
                <TabsContent value="health" className="m-0 focus-visible:outline-none">
                  <BiosManager />
                </TabsContent>
                <TabsContent value="services" className="m-0 focus-visible:outline-none"><ServicesSettings /></TabsContent>
                <TabsContent value="netplay" className="m-0 focus-visible:outline-none"><NetplaySettings /></TabsContent>
                <TabsContent value="automations" className="m-0 focus-visible:outline-none"><AutomationsSettings /></TabsContent>
                <TabsContent value="stats" className="m-0 focus-visible:outline-none p-6 overflow-y-auto flex-1">
                  <PlayStats />
                </TabsContent>
                <TabsContent value="help" className="m-0 focus-visible:outline-none">
                   <ul className="space-y-6">
                    <Step n={1} title="Add as Sidebar Item (Optional)">
                      Add this to your `configuration.yaml` to see HomeArcade in the HA sidebar:
                      <Code>{`panel_iframe:\n  cabinet:\n    title: "Cabinet"\n    icon: mdi:gamepad-variant\n    url: "\${window.location.origin}\${window.location.pathname}"`}</Code>
                    </Step>
                    <Step n={2} title="Configure PC Sensors">
                      Install <strong>HASS.Agent</strong> or <strong>IOT Link</strong> on your Windows PC to provide CPU, RAM, and Online sensors back to Home Assistant.
                    </Step>
                    <Step n={3} title="Set Up ROM Watch Directory">
                      Set <code>CABINET_ROM_WATCH_DIR</code> in the add-on configuration to enable automatic ROM imports from a folder.
                    </Step>
                  </ul>
                </TabsContent>
              </div>
            </div>
          </div>
          
          {/* Mobile-only reset button footer */}
          <footer className="md:hidden p-4 shrink-0 border-t border-white/5 bg-[#0f0f14]/80 backdrop-blur-md">
             <Button variant="ghost" size="sm" onClick={handleReset}
                className="w-full text-destructive hover:bg-destructive/10 gap-1.5 py-6 font-bold uppercase tracking-widest text-[10px]">
                <RotateCcw className="size-4" /> {t("settings.buttons.resetDefaults")}
              </Button>
          </footer>
        </main>
      </Tabs>
    </div>
  );
}
