"use client";

import { useEffect, useState } from "react";
import { applyNightMode, nightModeEnabled } from "@/lib/theme";

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function NightToggle({ className = "icon-btn" }: { className?: string }) {
  const [night, setNight] = useState(false);

  useEffect(() => {
    setNight(nightModeEnabled());
  }, []);

  return (
    <button
      className={className}
      type="button"
      aria-label={night ? "Day mode" : "Night mode"}
      title={night ? "Day mode" : "Night mode"}
      onClick={() => {
        const next = !night;
        applyNightMode(next);
        setNight(next);
      }}
    >
      {night ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
