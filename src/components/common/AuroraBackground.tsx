import React, { useMemo } from "react";

// Realistic star colour temperatures — mostly white and blue-white (hot,
// common) with a smaller share of pale yellow/orange (cooler stars),
// matching how stars actually look in long-exposure astrophotography
// rather than uniform pure white.
const STAR_COLORS = [
  "#ffffff",
  "#ffffff",
  "#f4f8ff",
  "#cfe0ff",
  "#fff4d6",
  "#ffe4c2",
];

/**
 * Animated deep-space "universe" backdrop, built to read as a real
 * long-exposure night-sky photo rather than a stylised light show: a
 * faint diagonal Milky-Way haze, a starfield where most stars are tiny
 * and static with only a minority softly glowing/twinkling, muted
 * low-opacity nebula dust, and a handful of galaxies rendered as layered
 * radial gradients at a fixed tilt (a bright core fading through a
 * diffuse halo, one nearer galaxy with a subtle dust lane) drifting only
 * barely — real astrophotography is essentially still, so nothing here
 * spins or sweeps visibly. All pure CSS (see .universe-* rules in
 * index.css), no extra dependency or canvas/WebGL cost. Purely
 * decorative: absolutely positioned, zero pointer events, sits behind
 * whatever is rendered after it (give sibling content `relative z-10`).
 */
export const AuroraBackground: React.FC = () => {
  // A fixed, memoized set of star positions/colours/sizes so they don't
  // reshuffle on every re-render of the page that hosts this.
  const stars = useMemo(
    () =>
      Array.from({ length: 130 }, (_, i) => {
        // Only a minority of stars are bright enough to show a soft glow
        // and a gentle twinkle — most are faint pinpricks, same as a
        // real sky.
        const isGlowing = Math.random() < 0.16;
        const size = isGlowing ? Math.random() * 1.6 + 1.2 : Math.random() * 1 + 0.4;
        return {
          id: i,
          top: Math.random() * 97 + 1,
          left: Math.random() * 98 + 1,
          size,
          color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
          isGlowing,
          delay: Math.random() * 4.5,
          duration: 3 + Math.random() * 4,
        };
      }),
    []
  );

  return (
    <div className="universe-wrap" aria-hidden="true">
      <div className="universe-milkyway" />

      <div className="universe-nebula universe-nebula-1" />
      <div className="universe-nebula universe-nebula-2" />
      <div className="universe-nebula universe-nebula-3" />

      <div className="universe-galaxy universe-galaxy-1" />
      <div className="universe-galaxy universe-galaxy-2" />
      <div className="universe-galaxy universe-galaxy-3" />
      <div className="universe-galaxy universe-galaxy-4" />

      {stars.map((s) => (
        <span
          key={s.id}
          className={`universe-star${s.isGlowing ? " is-glowing" : ""}`}
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            backgroundColor: s.color,
            boxShadow: s.isGlowing ? `0 0 ${s.size * 2.5}px ${s.size * 0.6}px ${s.color}99` : "none",
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
};
