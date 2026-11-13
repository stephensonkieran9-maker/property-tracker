// Shared side menu for every board page.
const I = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  growth: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/></svg>,
};

type Page = "overview" | "inbox" | "targets" | "growth";

const ITEMS: Array<{ key: Page; label: string; href?: string; icon: JSX.Element }> = [
  { key: "overview", label: "Overview", href: "/", icon: I.grid },
  { key: "inbox", label: "Inbox", href: "/inbox", icon: I.inbox },
  { key: "targets", label: "Targets", href: "/targets", icon: I.target },
  { key: "growth", label: "Growth", href: "/growth", icon: I.growth },
];

export default function Sidebar({ active }: { active: Page }) {
  return (
    <aside className="kb-side">
      <a className="kb-logo" href="/" style={{ textDecoration: "none" }}>K</a>
      {ITEMS.map((it) =>
        it.href ? (
          <a key={it.key} className={`kb-nav${it.key === active ? " active" : ""}`} href={it.href}>
            {it.icon}
            {it.label}
          </a>
        ) : (
          <span key={it.key} className="kb-nav" aria-disabled="true" title="Coming next">
            {it.icon}
            {it.label}
          </span>
        )
      )}
    </aside>
  );
}
