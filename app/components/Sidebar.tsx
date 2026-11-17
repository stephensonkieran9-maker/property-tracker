"use client";

// Shared menu: rendered once in the root layout, so it never redraws when you switch tabs.
// Internal links anywhere on the board switch pages in place instead of reloading.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markHydrated } from "@/lib/clientCache";

const I = {
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/></svg>,
  finance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>,
  growth: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>,
};

const ITEMS = [
  { href: "/pulse", label: "Pulse", icon: I.pulse },
  { href: "/", label: "Overview", icon: I.grid },
  { href: "/inbox", label: "Inbox", icon: I.inbox },
  { href: "/targets", label: "Targets", icon: I.target },
  { href: "/finance", label: "Finance", icon: I.finance },
  { href: "/growth", label: "Growth", icon: I.growth },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    markHydrated();
    ITEMS.forEach((it) => router.prefetch(it.href));
    // Same-site links switch pages in place (no full reload, menu stays put).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      e.preventDefault();
      router.push(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  return (
    <aside className="kb-side">
      <a className="kb-logo" href="/pulse" style={{ textDecoration: "none" }}>K</a>
      {ITEMS.map((it) => {
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <a key={it.href} className={`kb-nav${on ? " active" : ""}`} href={it.href} aria-current={on ? "page" : undefined}>
            {it.icon}
            {it.label}
          </a>
        );
      })}
    </aside>
  );
}
