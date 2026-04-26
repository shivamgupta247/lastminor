"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-[52px] h-[28px] rounded-full bg-muted" />;
  }

  const isDark = theme === "dark";

  return (
    <button
      id="theme-toggle"
      data-tour="tour-theme-toggle"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      style={{
        position: "relative",
        width: 52,
        height: 28,
        borderRadius: 9999,
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)",
        background: isDark
          ? "linear-gradient(135deg, #1e1b4b, #312e81)"
          : "linear-gradient(135deg, #bfdbfe, #93c5fd)",
        cursor: "pointer",
        transition: "all 0.3s ease",
        flexShrink: 0,
        padding: 0,
        outline: "none",
      }}
    >
      {/* Sliding knob */}
      <span
        style={{
          position: "absolute",
          top: 2,
          left: isDark ? 24 : 2,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: isDark ? "#1e1b4b" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isDark
            ? "0 2px 8px rgba(0,0,0,0.4)"
            : "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        {isDark ? (
          <Moon style={{ width: 12, height: 12, color: "#a5b4fc" }} />
        ) : (
          <Sun style={{ width: 12, height: 12, color: "#f59e0b" }} />
        )}
      </span>
    </button>
  );
}
