import { useNavigate } from "react-router-dom";
import {
  Cpu, Wrench, Layers, Box, Zap, Monitor, Hammer,
  Settings, MapPin, DoorOpen, ShoppingCart,
  LogIn, UserPlus, ArrowRight, Drill, ChevronRight,
  Package, Users, TrendingUp, Clock, Printer, CheckCircle2,
  RotateCcw, ShoppingBag, Compass, BookOpen,
} from "lucide-react";
import { T as THEME } from "../../lib/inventory/theme";
import { LOGO_IMAGE, BROWSE_LANDING_IMAGE, PRINT_SERVICES, MEMBERSHIP_PLAN, CREDIT_RATE, CREDIT_TIERS } from "../../lib/inventory/data.js";
import { useInventory } from "../../lib/inventory/InventoryContext";
import { Breadcrumb } from "../../components/Breadcrumb";

/* ── palette ─────────────────────────────────────────────────────────────── */
/* Reuses the shared inventory/global tokens instead of its own one-off hex.
   TEAL is inventory's own accent (var(--inv-accent)); DARK/CREAM/MUTED map
   1:1 onto the existing --charcoal/--cream/--inv-muted tokens. */
const TEAL    = "var(--color-inv-accent)";
const TEAL_DK = "var(--color-inv-accent-text)";
const DARK    = "var(--color-charcoal)";
const CREAM   = "var(--color-cream)";
const BORDER  = "var(--border)";
const MUTED   = "var(--color-inv-muted)";

/* ── data ────────────────────────────────────────────────────────────────── */
// `catId` matches the real category ids in lib/inventory/data.js (the
// Catalog page filters on these) — `id` stays the short display key used
// only for local list keys/the ticker below.
const CATEGORIES = [
  { id: "et",  catId: "electronic_tool",      label: "Electronic Tools",     icon: Zap,      desc: "Soldering stations, multimeters, probes",    tag: "TOOL",   room: "Makerspace Room" },
  { id: "ee",  catId: "electronic_equipment", label: "Electronic Equipment", icon: Cpu,      desc: "Power supplies, oscilloscopes, generators",  tag: "EQUIP",  room: "Makerspace Room" },
  { id: "ec",  catId: "electronic_component", label: "Electronic Components",icon: Settings, desc: "Arduino, sensors, modules, ICs, resistors",  tag: "COMP",   room: "Makerspace Room" },
  { id: "cnc", catId: "cnc_machines",         label: "CNC Machines",         icon: Drill,    desc: "Laser cutters, 3-axis routers, plotters",    tag: "CNC",    room: "Makerspace Room" },
  { id: "mm",  catId: "manual_mechanical",    label: "Mechanical Tools",     icon: Wrench,   desc: "Drill press, bench grinder, hand tools",     tag: "MECH",   room: "Mechanic Room"   },
  { id: "mf",  catId: "mechanical_fasteners", label: "Fasteners & Hardware", icon: Layers,   desc: "Bolts, nuts, screws, standoffs, washers",    tag: "FIX",    room: "Mechanic Room"   },
  { id: "dd",  catId: "digital_device",       label: "Digital Devices",      icon: Monitor,  desc: "Raspberry Pi, logic analyzers, peripherals", tag: "DEVICE", room: "Makerspace Room" },
  { id: "rm",  catId: "raw_material",         label: "Raw Materials",        icon: Box,      desc: "PLA filament, acrylic, plywood, foam",       tag: "MAT",    room: "Makerspace Room" },
];

const STEPS = [
  { n: "01", icon: UserPlus,     title: "Sign up",          desc: "Create an account and get your makerspace membership activated." },
  { n: "02", icon: MapPin,       title: "Search inventory", desc: "Filter by zone, category, type, room, and availability."         },
  { n: "03", icon: ShoppingCart, title: "Reserve or buy",   desc: "Book returnable equipment or purchase consumables with credits."  },
  { n: "04", icon: Hammer,       title: "Build something",  desc: "Pick up your items and start making. Return tools when done."     },
];

const HIGHLIGHTS = [
  { icon: Compass,  title: "Browse Resources",  color: TEAL,                 bg: "var(--color-inv-accent-light)", text: "Search 100+ tools, components, and materials by category, zone, and room; see live availability before you walk in." },
  { icon: BookOpen, title: "Learning Resources", color: "var(--community)",   bg: "color-mix(in oklch, var(--community) 12%, white)", text: "Guides and safety notes for every machine, so first-timers can borrow and use equipment with confidence." },
  { icon: Users,    title: "Community",          color: "var(--color-green)", bg: "var(--color-green-light)", text: "Join a community of student makers: share projects, get help from peers, and connect with makerspace staff." },
];

/* ── scene illustration ──────────────────────────────────────────────────── */
function StorageIllustration() {
  return (
    <svg viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 420, margin: "0 auto", display: "block" }}>
      {/* Back wall */}
      <rect x="20" y="20" width="320" height="180" rx="4" fill="#0e2d3a" />

      {/* Shelving unit */}
      {[0, 1, 2].map(row => (
        <g key={row}>
          <rect x="40" y={50 + row * 50} width="280" height="6" rx="2" fill="var(--color-inv-accent)" opacity="0.6" />
          {[0, 1, 2, 3, 4].map(col => (
            <rect key={col}
              x={52 + col * 54} y={22 + row * 50} width={38} height={28} rx="3"
              fill={[
                "color-mix(in oklch, var(--color-inv-accent) 45%, transparent)",
                "color-mix(in oklch, var(--color-green) 45%, transparent)",
                "color-mix(in oklch, var(--color-red) 35%, transparent)",
                "color-mix(in oklch, var(--color-inv-accent) 55%, transparent)",
                "color-mix(in oklch, var(--color-green) 35%, transparent)",
              ][col]}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          ))}
        </g>
      ))}

      {/* Bottom shelf */}
      <rect x="40" y="200" width="280" height="6" rx="2" fill="var(--color-inv-accent)" opacity="0.6" />

      {/* Side rails */}
      <rect x="36" y="20" width="5" height="186" rx="2" fill="color-mix(in oklch, var(--color-inv-accent) 60%, black)" />
      <rect x="319" y="20" width="5" height="186" rx="2" fill="color-mix(in oklch, var(--color-inv-accent) 60%, black)" />

      {/* Floating label chips */}
      {[
        { x: 54,  y: 12, label: "A-1", color: TEAL },
        { x: 108, y: 12, label: "A-2", color: "var(--color-green)" },
        { x: 162, y: 12, label: "A-3", color: "var(--color-red)" },
        { x: 216, y: 12, label: "B-1", color: TEAL },
        { x: 270, y: 12, label: "B-2", color: "var(--color-green)" },
      ].map(chip => (
        <g key={chip.label}>
          <rect x={chip.x} y={chip.y - 8} width="34" height="14" rx="7" fill={chip.color} opacity="0.85" />
          <text x={chip.x + 17} y={chip.y + 1} textAnchor="middle" fontSize="7" fontWeight="700" fill="white">{chip.label}</text>
        </g>
      ))}

      {/* Glow dots */}
      {[[58, 170], [165, 120], [290, 70]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={TEAL} opacity="0.6" />
      ))}
    </svg>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function Eyebrow({ label, light = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <span style={{ width: 32, height: 2, background: light ? "var(--on-dark-muted)" : TEAL }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: light ? "var(--on-dark-muted)" : MUTED }}>
        {label}
      </span>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const { items = [], users = [], borrows = [] } = useInventory();
  const go     = () => navigate("/login", { state: { from: "/inventory" } });
  const browse = () => navigate("/inventory/browse");
  // A specific category card opens the browse page pre-filtered to that
  // category, instead of dumping the visitor on the full unfiltered list.
  const browseCategory = (catId) => navigate(`/inventory/browse?category=${catId}`);

  // Real hours: Mon–Fri, 8am–5pm. Computed against the visitor's clock each
  // render, instead of a hardcoded "open today" label that was true 24/7.
  const now = new Date();
  const isOpenNow = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 8 && now.getHours() < 17;

  const liveStats = [
    { value: String(items.length),                                                                    label: "Items",        icon: Package    },
    { value: String(users.filter(u => u.role === "user" && u.membership === "active").length),        label: "Members",      icon: Users      },
    { value: String(borrows.filter(b => b.status === "active").length),                               label: "Borrowed Now", icon: TrendingUp },
    { value: "8",                                                                                     label: "Categories",   icon: Clock      },
  ];

  return (
    <div style={{ background: CREAM, color: DARK, fontFamily: "var(--font-sans)", minHeight: "100vh" }}>
      <style>{`
        @keyframes mv-ticker { to { transform: translateX(-50%) } }
        .mv-ticker-inner { animation: mv-ticker 32s linear infinite; display: flex; width: max-content; }
        .mv-ticker-inner:hover { animation-play-state: paused; }
        .mv-nav-link { font-size:13px;font-weight:500;color:var(--color-inv-muted);text-decoration:none;transition:color .15s;cursor:pointer; }
        .mv-nav-link:hover { color:${DARK}; }
        .mv-btn-teal { display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:10px;background:${TEAL};color:#fff;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:background .15s,transform .1s; }
        .mv-btn-teal:hover { background:${TEAL_DK};transform:translateY(-1px); }
        .mv-btn-ghost { display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:10px;background:transparent;color:${DARK};font-size:13px;font-weight:600;border:1.5px solid rgba(15,23,42,.18);cursor:pointer;transition:border-color .15s,background .15s; }
        .mv-btn-ghost:hover { border-color:${DARK};background:rgba(15,23,42,.04); }
        .mv-btn-ghost-white { display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:10px;background:transparent;color:#fff;font-size:13px;font-weight:600;border:1.5px solid rgba(255,255,255,.3);cursor:pointer;transition:border-color .15s; }
        .mv-btn-ghost-white:hover { border-color:var(--on-dark-muted); }
        .mv-btn-white { display:inline-flex;align-items:center;gap:8px;padding:13px 28px;border-radius:10px;background:#fff;color:${TEAL};font-size:13px;font-weight:700;border:none;cursor:pointer;transition:transform .1s; }
        .mv-btn-white:hover { transform:translateY(-1px); }
        .mv-cat-cell { padding:28px 24px;cursor:pointer;position:relative;overflow:hidden;transition:background .15s;background:transparent; }
        .mv-cat-cell:hover { background:var(--color-inv-accent-light); }
        .mv-cat-browse { transition:transform .2s;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em; }
        .mv-cat-cell:hover .mv-cat-browse { transform:translateX(4px); }
        .mv-footer-link { font-size:12px;color:var(--on-dark-muted);margin-bottom:9px;cursor:pointer;transition:color .15s;display:block; }
        .mv-footer-link:hover { color:#fff; }
        .mv-step-card { transition:background .15s,border-color .15s,box-shadow .15s; }
        .mv-step-card:hover { background:#fff!important;border-color:color-mix(in oklch, var(--color-inv-accent) 27%, transparent)!important;box-shadow:0 4px 20px color-mix(in oklch, var(--color-inv-accent) 10%, transparent); }
        .mv-testi-card { transition:box-shadow .2s; }
        .mv-testi-card:hover { box-shadow:0 8px 32px color-mix(in oklch, var(--color-inv-accent) 10%, transparent); }
        /* Section headers: Inter, larger on tablet/desktop */
        .mv-sec-h { font-family:'Inter','Poppins',sans-serif; font-weight:800; letter-spacing:-0.02em; }
        /* Buttons scale down on small screens */
        @media (max-width: 767px) {
          .mv-btn-teal, .mv-btn-ghost, .mv-btn-ghost-white { padding:9px 16px; font-size:12px; gap:6px; }
          .mv-btn-white { padding:10px 20px; font-size:12px; gap:6px; }
          .mv-cat-cell { padding:20px 16px; }
        }
      `}</style>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden", background: "linear-gradient(145deg,color-mix(in oklch, var(--color-inv-accent) 40%, black) 0%,var(--color-inv-accent-text) 55%,var(--color-inv-accent) 100%)" }}>
        {/* Grid overlay */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="grid-cols-1 gap-8 px-4 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-12 lg:pt-[72px]" style={{ position: "relative", zIndex: 1, maxWidth: 1320, margin: "0 auto", display: "grid", alignItems: "center" }}>
          {/* Left: headline */}
          <div style={{ paddingBottom: 72 }}>
            <Breadcrumb className="mb-4" light items={[
              { label: 'Home', to: '/' },
              { label: 'Inventory' },
            ]} />
            <div className="badge" style={{ marginBottom: 24, background: "color-mix(in oklch, var(--color-inv-accent) 15%, transparent)", border: "1px solid color-mix(in oklch, var(--color-inv-accent) 35%, transparent)" }}>
              <Package size={11} style={{ color: "color-mix(in oklch, var(--color-inv-accent) 55%, white)" }} />
              <span style={{ letterSpacing: ".2em", textTransform: "uppercase", color: "color-mix(in oklch, var(--color-inv-accent) 55%, white)" }}>CADT · Makerspace Inventory</span>
            </div>
            <div style={{ width: "fit-content", marginBottom: 24 }}>
              <h1 className="font-display" style={{ fontSize: "clamp(28px,3.6vw,48px)", lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>
                Build<br />Something <span style={{ color: "color-mix(in oklch, var(--color-inv-accent) 55%, white)" }}>Great</span>
              </h1>
              <p className="font-display" style={{ margin: "10px 0 0", fontSize: "clamp(12px,1.35vw,17px)", fontWeight: 500, color: "var(--on-dark-muted)", letterSpacing: "0.02em" }}>
                Powered by CADT<br />Makerspace Inventory
              </p>
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--on-dark-muted)", maxWidth: 460, marginBottom: 36 }}>
              Browse tools, borrow equipment, and purchase materials, searchable by zone, shelf, category, and room. Built for the CADT community.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
              <button className="mv-btn-teal" onClick={browse}>Browse Inventory <ArrowRight size={14} /></button>
              <button className="mv-btn-ghost-white" onClick={go}>
                <LogIn size={14} /> Login to Borrow
              </button>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, background: "color-mix(in oklch, var(--color-inv-accent) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--color-inv-accent) 25%, transparent)" }}>
              <DoorOpen size={15} style={{ color: "color-mix(in oklch, var(--color-inv-accent) 55%, white)" }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{isOpenNow ? "Makerspace is open now" : "Makerspace is closed now"}</p>
                <p style={{ fontSize: 11, color: "var(--on-dark-muted)" }}>Mon – Fri · 8am – 5pm · Innovation Center - 1st floor, Makerspace Room</p>
              </div>
            </div>
          </div>

          {/* Right: illustration */}
          <div style={{ paddingBottom: 40 }}>
            <StorageIllustration />
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 py-4 sm:px-12 sm:py-5" style={{ borderTop: "1px solid color-mix(in oklch, var(--color-inv-accent) 20%, transparent)" }}>
          <div className="grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", textAlign: "center" }}>
            {liveStats.map(({ value, label, icon: Icon }) => (
              <div key={label}>
                <p style={{ fontSize: 28, fontWeight: 800, color: "color-mix(in oklch, var(--color-inv-accent) 55%, white)", lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--on-dark-muted)", marginTop: 4 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────── */}
      <div style={{ background: DARK, color: "#fff", padding: "15px 0", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="mv-ticker-inner">
          {[...CATEGORIES, ...CATEGORIES, ...CATEGORIES, ...CATEGORIES].map((c, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "0 28px", fontSize: 13, fontWeight: 600, letterSpacing: ".05em" }}>
              {c.label}<span style={{ color: TEAL }}>·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── CATEGORIES ───────────────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 16 }}>
          <div>
            <Eyebrow label="Inventory" />
            <h2 className="mv-sec-h" style={{ fontSize: "clamp(30px,5vw,60px)" }}>Browse by Category</h2>
          </div>
          <button className="mv-btn-ghost" onClick={browse}><ArrowRight size={14} /> Full Catalog</button>
        </div>

        {/* Room legend */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { room: "Makerspace Room", color: TEAL, bg: "var(--color-inv-accent-light)" },
            { room: "Mechanic Room",   color: "var(--community)", bg: "color-mix(in oklch, var(--community) 12%, white)" },
          ].map(({ room, color, bg }) => (
            <div key={room} className="badge" style={{ background: bg, border: `1px solid color-mix(in oklch, ${color} 13%, transparent)` }}>
              <MapPin size={11} style={{ color }} />
              <span style={{ color, letterSpacing: ".04em" }}>{room}</span>
            </div>
          ))}
        </div>

        {/* Item type explainer: Returnable vs Consumable */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginBottom: 32 }}>
          {[
            { Icon: RotateCcw,   label: "Returnable", color: TEAL,      bg: "var(--color-inv-accent-light)", desc: "Borrow tools and equipment, then return them by your due date. No credits charged unless it's late or damaged." },
            { Icon: ShoppingBag, label: "Consumable",  color: "var(--color-green)", bg: "var(--color-green-light)", desc: "Materials you keep: filament, fasteners, solder wire. Purchased outright with makerspace credits." },
          ].map(({ Icon, label, color, bg, desc }) => (
            <div key={label} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 18px", borderRadius: 14, border: `1px solid ${BORDER}`, background: "#fff" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} style={{ color }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ display: "grid", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
          {CATEGORIES.map((cat, i) => {
            const Icon = cat.icon;
            const isLastRow = i >= 4;
            const isLastCol = (i + 1) % 4 === 0;
            const isMechanic = cat.room === "Mechanic Room";
            const roomColor = isMechanic ? "var(--community)" : TEAL;
            const roomBg    = isMechanic ? "color-mix(in oklch, var(--community) 12%, white)"  : "var(--color-inv-accent-light)";
            return (
              <div key={cat.id} className="mv-cat-cell border-b lg:border-b-0" onClick={() => browseCategory(cat.catId)}
                style={{ borderRight: isLastCol ? "none" : `1px solid ${BORDER}`, borderBottomColor: BORDER }}>
                <span style={{ position: "absolute", top: 12, right: 16, fontSize: 48, fontWeight: 700, color: "rgba(15,23,42,.04)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: roomBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Icon size={20} style={{ color: roomColor }} />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <span className="badge badge-sm uppercase tracking-[0.1em]" style={{ color: roomColor, background: roomBg }}>
                    {cat.tag}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: roomColor, opacity: .75 }}>
                    <MapPin size={8} />{cat.room}
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{cat.label}</p>
                <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>{cat.desc}</p>
                <span className="mv-cat-browse" style={{ color: roomColor }}>Browse <ChevronRight size={11} /></span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SERVICES ─────────────────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ background: "var(--color-inv-accent-light)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 16 }}>
            <div>
              <Eyebrow label="Services" />
              <h2 className="mv-sec-h" style={{ fontSize: "clamp(30px,5vw,60px)" }}>What We Offer</h2>
              <p style={{ marginTop: 8, fontSize: 14, color: MUTED, maxWidth: 480 }}>
                Submit a request and our staff will handle the rest, pay with your makerspace credits.
              </p>
            </div>
            <button className="mv-btn-ghost" onClick={go}><ArrowRight size={14} /> Request a Service</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24 }}>
            {PRINT_SERVICES.map(svc => {
              const Icon = svc.Icon;
              const isDoc = svc.id === "printing";
              const accentColor = isDoc ? "var(--color-inv-accent)" : "var(--community)";
              const accentBg    = isDoc ? "var(--color-inv-accent-light)" : "color-mix(in oklch, var(--community) 12%, white)";
              const feats = isDoc
                ? ["Black & white or color", "A4 / Letter format", "Submit file + page count"]
                : ["PLA, PETG, ABS filament", "Staff weigh finished print", "Credits charged post-print"];
              return (
                <div key={svc.id} style={{ background: "#fff", borderRadius: 20, border: `1px solid ${BORDER}`, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
                  {/* top accent bar */}
                  <div style={{ height: 4, background: accentColor, borderRadius: "20px 20px 0 0" }} />
                  {/* flex column so the Request button lands on the same line in both cards */}
                  <div style={{ padding: 28, display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 16, background: accentBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={24} style={{ color: accentColor }} />
                      </div>
                      <span className="badge" style={{ color: accentColor, background: accentBg, letterSpacing: ".04em" }}>
                        {isDoc ? "Document" : "3D Print"}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: DARK }}>{svc.label}</h3>
                    <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>{svc.desc}</p>

                    {/* rate */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 20 }}>
                      <span style={{ fontSize: 44, fontWeight: 800, color: DARK, lineHeight: 1 }}>{svc.rate}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{svc.unitLabel}</span>
                    </div>

                    {/* features */}
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {feats.map(f => (
                        <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: MUTED }}>
                          <CheckCircle2 size={13} style={{ color: accentColor, flexShrink: 0 }} /> {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      className="btn-primary"
                      onClick={go}
                      style={{ width: "100%", justifyContent: "center", border: "none", background: accentColor, color: "#fff", marginTop: "auto" }}
                    >
                      Request {isDoc ? "Printing" : "3D Print"} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── MEMBERSHIP & CREDITS ─────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ background: "#fff", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <Eyebrow label="Membership" />
            <h2 className="mv-sec-h" style={{ fontSize: "clamp(30px,5vw,60px)" }}>Membership &amp; Credits</h2>
            <p style={{ marginTop: 8, fontSize: 14, color: MUTED, maxWidth: 520 }}>
              One yearly membership unlocks borrowing and purchasing. Credits are the makerspace currency.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            {/* Membership plan */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ height: 4, background: TEAL }} />
              <div className="p-6 sm:p-8" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>Student Membership</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 48, fontWeight: 800, color: DARK, lineHeight: 1 }}>${MEMBERSHIP_PLAN.price}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>/ year</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-green)", marginBottom: 20 }}>+{MEMBERSHIP_PLAN.bonusCredits} bonus credits included</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {["Borrow any returnable tool", "Purchase consumable supplies with credits", "Priority equipment access", "Valid for 12 months from activation"].map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: MUTED }}>
                      <CheckCircle2 size={14} style={{ color: TEAL, flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button className="mv-btn-teal" onClick={go} style={{ marginTop: 24, justifyContent: "center" }}>
                  <UserPlus size={14} /> Join at the Front Desk
                </button>
              </div>
            </div>

            {/* Credit top-up */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ height: 4, background: "var(--events)" }} />
              <div className="p-6 sm:p-8" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--events)", marginBottom: 12 }}>Credit Top-Up</p>
                <p style={{ fontSize: 14, color: MUTED, marginBottom: 18 }}>
                  Rate: <strong style={{ color: DARK }}>{CREDIT_RATE} credits per $1</strong>, paid in cash or QR at the front desk.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {CREDIT_TIERS.map(([cr, usd]) => (
                    <div key={cr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "var(--color-cream)", border: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{cr} credits</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>${usd}.00</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: MUTED, marginTop: "auto", paddingTop: 18 }}>
                  Membership and top-ups are handled in person. This section is for reference only.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ background: "var(--color-cream)", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", alignItems: "stretch" }}>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 28, paddingBottom: 28 }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 44, height: 3, background: TEAL, borderRadius: 2 }} />
            <Eyebrow label="Getting Started" />
            <h2 className="mv-sec-h" style={{ fontSize: "clamp(30px,5vw,60px)", color: DARK, lineHeight: 1.08, marginBottom: 22 }}>
              User guide<br />for first-timers.
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: MUTED, maxWidth: 420 }}>
              New to the makerspace? Follow these steps to borrow equipment and start building your project.
            </p>
            <div style={{ position: "absolute", bottom: 0, left: 0, width: 44, height: 3, background: TEAL, borderRadius: 2 }} />
          </div>
          {/* Numbered steps, connected by a dotted line — each circle fades a
              little lighter than the last to read as progress. */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {STEPS.map(({ n, title, desc }, i) => {
              const isLast = i === STEPS.length - 1
              const circleBg = `color-mix(in oklch, ${TEAL} ${100 - i * 15}%, white)`
              return (
                <div key={n} style={{ display: "flex", gap: 20 }}>
                  {/* Circle + connector column */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", background: circleBg, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 800, flexShrink: 0, boxShadow: `0 4px 12px color-mix(in oklch, ${TEAL} 25%, transparent)`,
                    }}>
                      {i + 1}
                    </div>
                    {!isLast && (
                      <div style={{
                        flex: 1, minHeight: 36, width: 2, margin: "6px 0",
                        backgroundImage: `linear-gradient(${TEAL} 40%, transparent 0%)`,
                        backgroundPosition: "left", backgroundSize: "2px 9px", backgroundRepeat: "repeat-y",
                        opacity: 0.4,
                      }} />
                    )}
                  </div>
                  {/* Text */}
                  <div style={{ paddingBottom: isLast ? 0 : 28 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: DARK, margin: "6px 0 4px" }}>{title}</h3>
                    <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, maxWidth: 380 }}>{desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── COMMUNITY & RESOURCES ───────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ background: "#fff" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <Eyebrow label="Why Makerspace" />
            <h2 className="mv-sec-h" style={{ fontSize: "clamp(30px,5vw,60px)" }}>
              Built for the way you make.
            </h2>
          </div>
          <div className="grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5" style={{ display: "grid" }}>
            {HIGHLIGHTS.map(({ icon: Icon, title, color, bg, text }) => (
              <div key={title} className="mv-testi-card"
                style={{ background: "#fff", borderRadius: 14, padding: 28, border: `1px solid ${BORDER}` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 10 }}>{title}</p>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--muted-foreground)" }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS + CTA ──────────────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20" style={{ background: CREAM }}>
        <div className="grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", alignItems: "center" }}>
          {/* Stats in one row, vertically centered against the CTA card */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
            <Eyebrow label="By the numbers" />
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              {[
                { n: `${items.length}+`,       label: "Items Available",   sub: "Across all 8 categories"            },
                { n: `${users.filter(u => u.role === "user" && u.membership === "active").length}+`, label: "Active Members", sub: "Students, staff & researchers" },
                { n: `${borrows.length}+`,     label: "Borrows Recorded",  sub: "Successful equipment loans tracked" },
              ].map(({ n, label, sub }) => (
                <div key={label} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: "clamp(28px,3.5vw,48px)", fontWeight: 800, lineHeight: 1, color: DARK }}>{n}</p>
                  <p className="text-xs sm:text-lg" style={{ fontWeight: 700, marginTop: 8 }}>{label}</p>
                  <p className="hidden sm:block" style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</p>
                  <div style={{ width: 32, height: 2, background: TEAL, margin: "14px auto 0" }} />
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-11" style={{ background: `linear-gradient(145deg,${TEAL} 0%,${TEAL_DK} 100%)`, borderRadius: 20, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)",
              backgroundSize: "36px 36px",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <Eyebrow label="CADT, Phnom Penh" light />
              <h3 className="mv-sec-h" style={{ fontSize: "clamp(26px,3.5vw,48px)", color: "#fff", lineHeight: 1.15, marginBottom: 20 }}>
                The makerspace<br />of the future, today.
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--on-dark-muted)", marginBottom: 32 }}>
                Real-time availability, seamless borrowing, and credit-based purchasing: all in one platform built for the CADT community.
              </p>
              {/* Buttons stay on one line; media query shrinks them on mobile */}
              <div style={{ display: "flex", gap: 10, flexWrap: "nowrap" }}>
                <button className="mv-btn-white" onClick={go}><UserPlus size={14} /> Create Account</button>
                <button className="mv-btn-ghost-white" onClick={browse}><ArrowRight size={14} /> Browse First</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer removed — InventoryLayout already renders the shared <AppFooter />. */}
    </div>
  );
}
