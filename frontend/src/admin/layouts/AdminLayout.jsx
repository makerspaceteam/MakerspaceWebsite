import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { AdminSidebar } from "../components/AdminSidebar";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 224;
const STORAGE_KEY = "cadt_admin_sidebar_width";

export default function AdminLayout() {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const [resizing, setResizing] = useState(false);
  // Below lg (tablet/mobile), the sidebar is an overlay drawer instead of a
  // permanent column — a fixed 200-480px rail left no usable width for the
  // page content at tablet sizes. Closed by default so pages aren't covered
  // on first load.
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Inventory pages render their own full-width top bar right of the sidebar,
  // so they get the raw area; other modules keep the padded, centered main.
  const fullBleed = location.pathname.startsWith("/admin/inventory");

  // Navigating should close the drawer — otherwise it stays open covering
  // the page you just tapped into.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (e) => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    const onUp = () => setResizing(false);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  return (
    <div className="flex min-h-screen bg-muted">
      {/* Backdrop: only present (and only intercepts clicks) while the
          drawer is open below lg. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <AdminSidebar width={width} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Drag handle: VS Code style, invisible until hovered/dragged.
          Desktop only — the sidebar is an overlay drawer below lg, so
          dragging its width there doesn't apply. */}
      <div
        onPointerDown={(e) => { e.preventDefault(); setResizing(true); }}
        className={`hidden lg:block w-1 shrink-0 cursor-col-resize transition-colors ${resizing ? "bg-blue-500/70" : "hover:bg-blue-400/50"}`}
      />

      <div className="flex-1 min-w-0 overflow-auto">
        {/* Tablet/mobile top bar: hamburger opens the sidebar drawer.
            Hidden at lg+, where the sidebar is always visible instead. */}
        <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">Admin Panel</span>
        </div>

        {fullBleed ? (
          <Outlet />
        ) : (
          <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </main>
        )}
      </div>
    </div>
  );
}
