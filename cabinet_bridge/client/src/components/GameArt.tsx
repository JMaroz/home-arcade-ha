import { useState } from "react";
import type { Game, System } from "@/data/library";
import { ConsoleSilhouette } from "@/components/ConsoleSilhouette";
import { SystemLogo } from "@/components/SystemLogo";
import { KyleBingIcon } from "@/components/KyleBingIcon";
import { apiUrl } from "@/lib/queryClient";

/**
 * Procedural cover art rendered from the game's gradient palette + a
 * deterministic geometric overlay. No image assets needed.
 */
export function GameArt({
  game,
  className = "",
  priority = false,
}: {
  game: Game;
  className?: string;
  priority?: boolean;
}) {
  const [a, b, c] = game.art;
  const seed = hashSeed(game.id);
  const angle = 130 + (seed % 60); // 130-190deg
  const accent = `hsl(${b})`;
  const dark = `hsl(${a})`;
  const light = `hsl(${c})`;

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      role="img"
      aria-label={`${game.title} cover art`}
      style={{
        background: `linear-gradient(${angle}deg, ${dark} 0%, ${accent} 55%, ${light} 100%)`,
      }}
    >
      {/*
       * All art goes through /api/art proxy to avoid CORS.
       * Uploaded games use /api/roms/:id/art (server already does this).
       * Demo/seeded games use /api/art?url=<encoded_artUrl>.
       * On error the img is hidden so the gradient fallback shows.
       */}
      {game.romId && game.artUrl ? (
        <img
          src={apiUrl(`/api/roms/${game.romId}/art`)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          data-testid={`img-art-${game.id}`}
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = "none";
          }}
        />
      ) : game.artUrl ? (
        <img
          src={apiUrl(`/api/art?url=${encodeURIComponent(game.artUrl)}`)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          data-testid={`img-art-${game.id}`}
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = "none";
          }}
        />
      ) : null}
      {game.artUrl ? <div className="absolute inset-0 bg-black/10" /> : null}
      {/* Soft vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 110%, rgba(0,0,0,0.55) 0%, transparent 60%)",
        }}
      />
      {/* Geometric overlay — 3 variants */}
      {!game.artUrl && seed % 3 === 0 ? <CircleStack accent={accent} /> : null}
      {!game.artUrl && seed % 3 === 1 ? <DiagonalBars accent={accent} /> : null}
      {!game.artUrl && seed % 3 === 2 ? <PixelGrid accent={accent} /> : null}

      {/* Title plate */}
      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/45 to-transparent">
        <div className="font-display text-[13px] 2xl:text-sm font-bold leading-[1.15] text-white drop-shadow line-clamp-1">
          {game.title}
        </div>
      </div>
    </div>
  );
}

export function SystemTile({
  system,
  className = "",
}: {
  system: System;
  className?: string;
}) {
  const [a, b] = system.art;
  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-between overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(160deg, hsl(${a}) 30%, hsl(${b}) 100%)`,
      }}
    >
      {/* Top section: icon + text */}
      <div className="flex flex-col items-center justify-center flex-1 w-full px-4 pt-6 pb-2 gap-3">
        <KyleBingIcon
          systemId={system.id}
          className="h-[55%] object-contain"
        />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white opacity-90 text-center leading-tight">
          {system.shortName}
        </span>
      </div>

    </div>
  );
}

function CircleStack({ accent }: { accent: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 200 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g opacity="0.35" fill="none" stroke="white" strokeWidth="1.2">
        <circle cx="160" cy="60" r="36" />
        <circle cx="160" cy="60" r="58" />
        <circle cx="160" cy="60" r="82" />
      </g>
      <circle cx="160" cy="60" r="14" fill={accent} opacity="0.7" />
    </svg>
  );
}

function DiagonalBars({ accent }: { accent: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 200 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g opacity="0.22">
        {Array.from({ length: 14 }).map((_, i) => (
          <rect
            key={i}
            x={-40 + i * 20}
            y={-20}
            width="6"
            height="320"
            transform={`rotate(20 ${i * 20} 140)`}
            fill="white"
          />
        ))}
      </g>
      <rect
        x="14"
        y="14"
        width="38"
        height="38"
        fill={accent}
        opacity="0.55"
        rx="2"
      />
    </svg>
  );
}

function PixelGrid({ accent, dim = false }: { accent: string; dim?: boolean }) {
  const opacity = dim ? 0.15 : 0.28;
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 200 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g opacity={opacity}>
        {Array.from({ length: 8 }).flatMap((_, row) =>
          Array.from({ length: 10 }).map((_, col) => {
            const r = (row * 7 + col * 3) % 5;
            if (r > 2) return null;
            return (
              <rect
                key={`${row}-${col}`}
                x={col * 20 + 6}
                y={row * 20 + 6}
                width="10"
                height="10"
                fill={r === 0 ? accent : "white"}
                rx="1"
              />
            );
          }),
        )}
      </g>
    </svg>
  );
}

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
