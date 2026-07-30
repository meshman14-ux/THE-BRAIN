"use client";

import { useEffect, useState } from "react";

type Theme = "paper" | "dark";
const KEY = "brain-theme";

/** Paper is the default (Jay's Blueprint language); dark is opt-in. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("paper");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? "paper";
    apply(saved);
    setTheme(saved);
  }, []);

  function apply(t: Theme) {
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", t === "dark" ? "#0b0d11" : "#f4f2ee");
  }

  function toggle() {
    const next: Theme = theme === "paper" ? "dark" : "paper";
    setTheme(next);
    apply(next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button
      onClick={toggle}
      className="chip"
      title={theme === "paper" ? "Switch to dark" : "Switch to paper"}
      aria-label="Toggle theme"
    >
      {theme === "paper" ? "☾" : "☀"}
    </button>
  );
}
