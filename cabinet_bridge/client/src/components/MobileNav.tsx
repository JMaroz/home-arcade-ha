import React from "react";
import { Link, useLocation } from "wouter";
import { Home, Trophy, Settings, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useUI } from "@/App";

export function AppBottomNav() {
  const [location] = useLocation();
  const { setScannerOpen } = useUI();

  const navItems = [
    { label: "Home", icon: Home, href: "/" },
    { label: "Scan", icon: QrCode, onClick: () => setScannerOpen(true) },
    { label: "Medals", icon: Trophy, href: "/achievements" },
    { label: "Settings", icon: Settings, href: "/settings" },
  ];

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6 left-0 right-0 z-50 pointer-events-none px-4 sm:px-6">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div 
          className={cn(
            "relative flex items-center justify-around h-16 px-2",
            "bg-[#0a0a0a] rounded-xl border border-white/10",
            "shadow-[0_0_40px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]",
            "overflow-hidden"
          )}
        >
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          {navItems.map((item) => {
            const isActive = item.href ? location === item.href : false;
            const Icon = item.icon;

            const content = (
              <>
                {/* Cyber-Active Frame */}
                <AnimatePresence mode="wait">
                  {isActive && (
                    <motion.div
                      layoutId="cyber-frame"
                      className="absolute inset-1 border border-primary/30 rounded-lg bg-primary/[0.03]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    >
                      {/* Corner Accents */}
                      <div className="absolute top-0 left-0 size-1.5 border-t border-l border-primary shadow-[0_0_8px_rgba(176,93,252,0.5)]" />
                      <div className="absolute top-0 right-0 size-1.5 border-t border-r border-primary shadow-[0_0_8px_rgba(176,93,252,0.5)]" />
                      <div className="absolute bottom-0 left-0 size-1.5 border-b border-l border-primary shadow-[0_0_8px_rgba(176,93,252,0.5)]" />
                      <div className="absolute bottom-0 right-0 size-1.5 border-b border-r border-primary shadow-[0_0_8px_rgba(176,93,252,0.5)]" />
                      
                      {/* Top Scanning Line */}
                      <motion.div 
                        initial={{ left: "-100%" }}
                        animate={{ left: "100%" }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        className="absolute top-0 h-[1px] w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <motion.div
                  animate={{ 
                    scale: isActive ? 1.1 : 1,
                    filter: isActive ? "drop-shadow(0 0 8px rgba(176,93,252,0.4))" : "none"
                  }}
                  className="relative z-10"
                >
                  <Icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                </motion.div>

                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-[8px] font-black uppercase tracking-[0.2em] mt-1.5 relative z-10"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            );

            if (item.onClick) {
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[64px] h-14 transition-all duration-300 relative group text-white/20 hover:text-white/40"
                  )}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[64px] h-14 transition-all duration-300 relative group",
                  isActive ? "text-primary" : "text-white/20 hover:text-white/40"
                )}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
