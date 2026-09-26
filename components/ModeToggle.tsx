"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Trader ⇄ Firm mode switch.
 *
 * "Trader" is the trader home page (`/`); "Firm" is the firm directory
 * (`/firm` and every nested `/firm/*` route). The same control is rendered on
 * both sides, so switching is a round trip instead of a one-way trip.
 *
 * Both entries are real links rather than buttons, so they stay keyboard
 * reachable, middle-clickable, and back/forward friendly.
 */
const MODES = [
  {
    label: "Trader",
    href: "/",
    isActivePath: (pathname: string) => pathname === "/",
  },
  {
    label: "Firm",
    href: "/firm",
    isActivePath: (pathname: string) =>
      pathname === "/firm" || pathname.startsWith("/firm/"),
  },
];

export function ModeToggle({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const pathname = usePathname();

  // The home page is a dark glassmorphism surface; the firm pages render on
  // the light app canvas. Same control, two skins.
  const styles =
    theme === "dark"
      ? {
          shell: "border-white/10 bg-white/5",
          active: "bg-white/10 text-white",
          inactive: "text-white/50 hover:text-white",
        }
      : {
          shell: "border-[var(--card-border)] bg-[var(--neutral-fill)]",
          active: "bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm",
          inactive:
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        };

  return (
    <nav
      aria-label="Trader or firm view"
      className={`inline-flex rounded-full border p-1 ${styles.shell}`}
    >
      {MODES.map((mode) => {
        const isActive = mode.isActivePath(pathname);
        return (
          <Link
            key={mode.label}
            href={mode.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition ${
              isActive ? styles.active : styles.inactive
            }`}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
