import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, CreditCard, Bell, Package2, ChevronRight, BadgeCheck,
  X, Printer, Box, Zap, Layers, MapPin, Clock, Users, Star,
  FileText, Cpu, Wrench, CheckCircle2,
} from 'lucide-react'
import { T as THEME } from '../../lib/inventory/theme'
import { CATEGORIES, PRINT_SERVICES, BROWSE_LANDING_IMAGE } from '../../lib/inventory/data'
import { useAuth } from '../../hub/AuthContext'
import { useInventory } from '../../lib/inventory/InventoryContext'
import { Breadcrumb } from '../../components/Breadcrumb'

const NAVY   = 'var(--color-inv-accent-text)' // teal-700 — primary accent (kept name to avoid touching every usage)
const TEAL   = 'var(--color-inv-accent)'
const CYAN   = 'color-mix(in oklch, var(--color-inv-accent) 55%, white)'
const CREAM  = THEME.cream
const BORDER = THEME.border

// Short tag codes matching the landing page's category tiles, for the same
// editorial-grid look on this page's "Equipment Rooms" section.
const CATEGORY_TAG = {
  electronic_tool: 'TOOL', electronic_equipment: 'EQUIP', electronic_component: 'COMP',
  cnc_machines: 'CNC', manual_mechanical: 'MECH', mechanical_fasteners: 'FIX',
  digital_device: 'DEVICE', raw_material: 'MAT',
}

// ── Small section label ────────────────────────────────────────────────────────
function Tag({ children, color = NAVY }) {
  return (
    <span className="badge uppercase tracking-[0.1em]" style={{ background: `color-mix(in oklch, ${color} 9%, transparent)`, color }}>
      {children}
    </span>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ value, label, color = THEME.charcoal }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function HomePage() {
  // Credits/membership now come from the real database (useAuth), not the
  // Inventory module's own local copy — everything else about this "user"
  // (id, name, matching borrow/request records) still comes from Inventory's
  // local state, since borrow/purchase logic isn't wired to the real backend yet.
  const navigate = useNavigate()
  const { user: hubUser } = useAuth()
  const { user: invUser, items, borrows, notifications, filaments = [], showToast } = useInventory()
  const setPage = (p) => navigate(p === '/notifications' ? '/notifications' : `/inventory${p}`)
  const user = { ...invUser, credits: hubUser?.credits ?? 0, membership: hubUser?.isMember ? 'active' : 'inactive' }

  const activeLoans = borrows.filter(b => b.userId === user.id && b.action !== 'purchased' && b.status === 'active').length
  const unread      = notifications.filter(n => !n.read && (n.forRoles?.includes('user') || n.userId === user.id)).length
  const available   = items.filter(i => i.status === 'available').length

  // Membership & credits live on the shared "Your Credits" hub page (same one
  // the top-nav credits pill opens) — not a modal on this page.
  const goToCredits = () => navigate('/credits')
  // Equipment Rooms tiles link straight to the full catalog, pre-filtered.
  const goToCategory = (catId) => setPage(`/catalog?category=${catId}`)

  // Due-date reminder — briefly toast once per visit if the student has a borrow
  // due soon or overdue, so they don't find out only after a late fee.
  useEffect(() => {
    const today = new Date()
    const dueSoon = borrows.find(b => {
      if (b.userId !== user.id || b.action === 'purchased' || b.status !== 'active' || !b.dueDate) return false
      const daysLeft = Math.ceil((new Date(b.dueDate) - today) / 86400000)
      return daysLeft <= 1
    })
    if (!dueSoon) return
    const daysLeft = Math.ceil((new Date(dueSoon.dueDate) - today) / 86400000)
    const msg = daysLeft < 0 ? `Overdue: "${dueSoon.itemName}" was due ${dueSoon.dueDate}.`
      : daysLeft === 0 ? `Reminder: "${dueSoon.itemName}" is due today.`
      : `Reminder: "${dueSoon.itemName}" is due tomorrow.`
    const t = setTimeout(() => showToast(msg, daysLeft < 0 ? 'error' : 'success'), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Both print services are walk-up only — staff run and charge them at the
  // front desk, so there's no remote request flow for either.

  return (
    <div style={{ background: CREAM, minHeight: '100%' }}>

      {/* ── HERO — lighter teal gradient ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(145deg, color-mix(in oklch, var(--color-inv-accent) 40%, black) 0%, var(--color-inv-accent-text) 55%, var(--color-inv-accent) 100%)' }}>
        {/* Grid overlay */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative z-10 mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.05fr] xl:grid-cols-[1fr_1.2fr]">

            {/* Left */}
            <div>
              <Breadcrumb className="mb-4" light items={[
                { label: 'Home', to: '/' },
                { label: 'Inventory' },
              ]} />
              <h1 className="font-display leading-[1.1] tracking-tight" style={{ fontSize: 'clamp(30px,5vw,58px)', margin: 0, color: '#fff' }}>
                Welcome back,<br />
                <span style={{ color: CYAN }}>{user.name.split(' ')[0]}.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: 'var(--on-dark-muted)' }}>
                Your makerspace hub — borrow equipment, print documents, run 3D prints, and manage your credits all in one place.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => setPage('/catalog')}
                  className="btn-primary text-white"
                  style={{ background: TEAL }}>
                  Browse Equipment <ArrowRight size={14} />
                </button>
                <button onClick={goToCredits}
                  className="btn-secondary text-white"
                  style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)' }}>
                  <CreditCard size={14} /> Manage Credits
                </button>
              </div>

              {/* Stats row */}
              <div className="mt-8 flex flex-wrap items-center gap-4 pt-6 sm:gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <StatPill value={user.credits} label="Credits" color={CYAN} />
                <div className="hidden sm:block" style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
                <button onClick={() => setPage('/notifications')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <StatPill value={activeLoans} label="Active borrows" color="var(--color-amber)" />
                </button>
                <div className="hidden sm:block" style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
                <StatPill value={available} label="Items available" color="var(--color-green)" />
                <button onClick={() => setPage('/notifications')}
                  className="btn-secondary text-left sm:ml-auto"
                  style={{ borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)' }}>
                  <Bell size={14} style={{ color: '#fff' }} />
                  <span className="text-xs font-semibold" style={{ color: '#fff' }}>{unread} unread</span>
                  <ChevronRight size={12} style={{ color: 'var(--on-dark-muted)' }} />
                </button>
              </div>
            </div>

            {/* Right — hero image */}
            <div className="mx-auto hidden w-full max-w-[420px] sm:block lg:max-w-[560px] xl:max-w-[640px]">
              <img src={BROWSE_LANDING_IMAGE} alt="CADT Makerspace" className="w-full object-contain" style={{ filter: 'drop-shadow(0 16px 48px color-mix(in oklch, var(--color-inv-accent) 30%, transparent))' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── MAKERSPACE INFO STRIP ── */}
      <section style={{ background: 'color-mix(in oklch, var(--color-inv-accent) 40%, black)', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-0 px-5 sm:px-8 md:grid-cols-4 lg:px-12">
          {[
            { Icon: MapPin,  label: 'Location',    value: 'CADT, Innovation Center - Makerspace Room' },
            { Icon: Clock,   label: 'Open Hours',  value: 'Mon – Fri · 8am – 5pm'  },
            { Icon: Users,   label: 'Members',     value: `${items.filter(i=>i.status!=='maintenance').length} items ready` },
            { Icon: Star,    label: 'Membership',  value: user.membership === 'active' ? 'Active ✓' : 'Inactive — renew' },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-5" style={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>
              <Icon size={18} color="var(--on-dark-muted)" strokeWidth={1.5} />
              <div>
                <div style={{ fontSize: 10, color: 'var(--on-dark-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginTop: 2 }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Tag color={THEME.purple}>Services</Tag>
            <h2 className="inv-sec-h mt-3 text-3xl font-bold text-charcoal sm:text-4xl">What We Offer</h2>
            <p className="mt-2 max-w-lg text-sm text-inv-muted">Submit a request and our staff will handle the rest — pay with your makerspace credits.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Document Printing */}
          <div className="group relative flex overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: BORDER }}>
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-[20px]" style={{ background: THEME.blue }} />
            <div className="flex flex-1 flex-col p-7">
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl" style={{ background: THEME.blueLight }}>
                  <Printer size={24} color={THEME.blue} />
                </div>
                <span className="badge" style={{ color: THEME.blue, background: THEME.blueLight }}>Document</span>
              </div>
              <h3 className="text-lg font-bold text-charcoal">Document Printing</h3>
              <p className="mt-1 text-sm leading-relaxed text-inv-muted">Black & white or color printing at the makerspace front desk. Staff will print your file on request.</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span style={{ fontSize: 44, fontWeight: 800, color: NAVY, lineHeight: 1 }}>2</span>
                <span className="text-sm font-bold text-inv-muted">credits / page</span>
              </div>

              <ul className="mt-4 space-y-2">
                {['Black & white or color', 'A4 / Letter format', 'Submit file + page count'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-inv-muted">
                    <CheckCircle2 size={13} color={THEME.green} /> {f}
                  </li>
                ))}
              </ul>

              {/* Walk-up only — staff charge this instantly at the front desk,
                  so there's no remote request to submit. */}
              <div className="mt-auto flex items-center gap-2 pt-8 text-sm font-bold" style={{ color: THEME.blue }}>
                <MapPin size={13} /> Available at the front desk — visit in makerspace
              </div>
            </div>
          </div>

          {/* 3D Printing */}
          <div className="group relative flex overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: BORDER }}>
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-[20px]" style={{ background: THEME.purple }} />
            <div className="flex flex-1 flex-col p-7">
              <div className="mb-5 flex items-start justify-between">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl" style={{ background: THEME.purpleLight }}>
                  <Box size={24} color={THEME.purple} />
                </div>
                <span className="badge" style={{ color: THEME.purple, background: THEME.purpleLight }}>3D Print</span>
              </div>
              <h3 className="text-lg font-bold text-charcoal">3D Printing</h3>
              <p className="mt-1 text-sm leading-relaxed text-inv-muted">Submit your model file and choose a filament. Staff will print and weigh it — you pay based on filament used.</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span style={{ fontSize: 44, fontWeight: 800, color: NAVY, lineHeight: 1 }}>4</span>
                <span className="text-sm font-bold text-inv-muted">credits / gram</span>
              </div>

              <ul className="mt-4 space-y-2">
                {['PLA, PETG, ABS, TPU', 'Staff weigh finished print', 'Credits charged post-print'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-inv-muted">
                    <CheckCircle2 size={13} color={THEME.purple} /> {f}
                  </li>
                ))}
              </ul>

              {/* Filament swatches — plain text row, no boxed background. */}
              {filaments.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-inv-muted">Filaments in stock</span>
                  {filaments.map(f => (
                    <div key={f.id} title={`${f.name} ${f.color} · ${f.stockGrams}g`}
                      style={{ width: 18, height: 18, borderRadius: '50%', background: f.hex, border: `2px solid ${BORDER}` }} />
                  ))}
                </div>
              )}

              {/* Walk-up only, same as document printing — staff run and weigh
                  the print at the counter, so no remote request either. */}
              <div className="mt-auto flex items-center gap-2 pt-8 text-sm font-bold" style={{ color: THEME.purple }}>
                <MapPin size={13} /> Available at the front desk — visit in makerspace
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CATEGORY INFO CARDS — same editorial bordered-grid tile design as
          the guest landing page's "Browse by Category" section, so the look
          is consistent whether you've joined yet or not. ── */}
      <style>{`
        .home-cat-cell { padding:24px 20px;cursor:pointer;position:relative;overflow:hidden;transition:background .15s;background:transparent; }
        .home-cat-cell:hover { background:var(--color-inv-accent-light); }
        .home-cat-browse { transition:transform .2s;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em; }
        .home-cat-cell:hover .home-cat-browse { transform:translateX(4px); }
      `}</style>
      <section className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <Tag color={THEME.teal}>What's Here</Tag>
        <h2 className="inv-sec-h mt-3 mb-2 text-3xl font-bold text-charcoal sm:text-4xl">Equipment Rooms</h2>
        <p className="mb-8 max-w-lg text-sm text-inv-muted">The makerspace is organized into dedicated rooms for each discipline. You'll need a valid membership to borrow.</p>

        <div className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ display: 'grid', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
          {CATEGORIES.map((c, i) => {
            const DESC_MAP = {
              electronic_equipment: 'Power supplies, oscilloscopes, signal generators & lab instruments.',
              electronic_component: 'Arduino, ESP32, sensors, ICs, resistors, capacitors & modules.',
              cnc_machines:         'Laser cutters, 3-axis routers & CNC plotters for fabrication.',
              manual_mechanical:    'Drill press, bench grinder, angle grinder & hand tools.',
              mechanical_fasteners: 'Bolts, nuts, screws, standoffs, washers & hardware kits.',
              digital_device:       'Raspberry Pi, logic analyzers, cameras & compute peripherals.',
              raw_material:         'PLA filament, acrylic sheets, plywood, foam & craft materials.',
              electronic_tool:      'Soldering stations, multimeters, wire strippers & PCB tools.',
            }
            const isLastCol = (i + 1) % 4 === 0
            // Same two-color, room-based scheme as the Landing page's own
            // Browse by Category section — teal for Makerspace Room, the
            // community accent for Mechanic Room — not each category's own color.
            const isMechanic = c.room === 'Mechanic Room'
            const roomColor = isMechanic ? 'var(--community)' : TEAL
            const roomBg    = isMechanic ? 'color-mix(in oklch, var(--community) 12%, white)' : 'var(--color-inv-accent-light)'
            return (
              <div key={c.id} className="home-cat-cell border-b lg:border-b-0"
                onClick={() => goToCategory(c.id)}
                style={{ borderRight: isLastCol ? 'none' : `1px solid ${BORDER}`, borderBottomColor: BORDER }}>
                <span style={{ position: 'absolute', top: 12, right: 16, fontSize: 48, fontWeight: 700, color: 'rgba(15,23,42,.04)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: roomBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <c.Icon size={20} color={roomColor} />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-sm uppercase tracking-[0.1em]" style={{ color: roomColor, background: roomBg }}>
                    {CATEGORY_TAG[c.id] || c.label.slice(0, 4).toUpperCase()}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, color: roomColor, opacity: .75 }}>
                    <MapPin size={8} />{c.room}
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: THEME.charcoal }}>{c.label}</p>
                <p style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5, marginBottom: 14 }}>{DESC_MAP[c.id] || c.room}</p>
                <span className="home-cat-browse" style={{ color: roomColor }}>Browse <ChevronRight size={11} /></span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── HOW TO USE ── */}
      <section style={{ background: '#fff', borderTop: `1px solid ${BORDER}` }}>
        <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
          <div className="mx-auto max-w-2xl text-center">
            <Tag color={THEME.green}>Get Started</Tag>
            <h2 className="inv-sec-h mt-3 text-3xl font-bold text-charcoal sm:text-4xl">How It Works</h2>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { num: '01', Icon: CreditCard,   color: NAVY,          title: 'Top up credits',         desc: 'Tap the credits pill in the top bar (or Manage Credits) to view plans and top up at the front desk.' },
              { num: '02', Icon: Package2,     color: THEME.blue,    title: 'Browse & request',        desc: 'Find tools in the catalog. Borrow returnables or buy consumables with credits.' },
              { num: '03', Icon: Cpu,          color: THEME.purple,  title: 'Staff approves',          desc: 'Lab staff confirm your request and prepare the item for pick-up.' },
              { num: '04', Icon: CheckCircle2, color: THEME.green,   title: 'Use & return',            desc: 'Use the equipment and return borrowed items within 7 days.' },
            ].map(({ num, Icon, color, title, desc }) => (
              <div key={num} className="flex flex-col gap-4 rounded-2xl border p-5" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklch, ${color} 9%, transparent)` }}>
                    <Icon size={18} color={color} />
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800, color: BORDER }}>{num}</span>
                </div>
                <div>
                  <h3 className="m-0 text-sm font-bold text-charcoal">{title}</h3>
                  <p className="m-0 mt-1.5 text-xs leading-relaxed text-inv-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATUS BANNER ── */}
      <section className="mx-auto max-w-[1280px] px-5 pb-12 pt-8 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-2xl border p-5"
            style={{ background: user.membership === 'active' ? THEME.greenLight : THEME.redLight, borderColor: user.membership === 'active' ? 'color-mix(in oklch, ' + THEME.green + ' 25%, transparent)' : 'color-mix(in oklch, ' + THEME.red + ' 25%, transparent)' }}>
            <BadgeCheck size={28} color={user.membership === 'active' ? THEME.green : THEME.red} />
            <div>
              <p className="m-0 text-sm font-bold text-charcoal">{user.membership === 'active' ? 'Membership Active' : 'Membership Inactive'}</p>
              <p className="m-0 mt-0.5 text-xs text-inv-muted">{user.membership === 'active' ? 'Full access to borrow and purchase items.' : 'Activate to start borrowing tools.'}</p>
            </div>
            {user.membership !== 'active' && (
              <button onClick={goToCredits} className="btn-primary ml-auto shrink-0 border-none text-white" style={{ background: NAVY }}>
                Activate
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 rounded-2xl border p-5" style={{ background: THEME.accentLight, borderColor: 'color-mix(in oklch, ' + THEME.accent + ' 25%, transparent)' }}>
            <Package2 size={28} color={NAVY} />
            <div>
              <p className="m-0 text-sm font-bold text-charcoal">{available} items available right now</p>
              <p className="m-0 mt-0.5 text-xs text-inv-muted">Ready to borrow or purchase with your credits.</p>
            </div>
            <button onClick={() => setPage('/catalog')} className="btn-primary ml-auto shrink-0 border-none text-white" style={{ background: NAVY }}>
              Browse
            </button>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA — same gradient treatment as the hero ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(145deg, color-mix(in oklch, var(--color-inv-accent) 40%, black) 0%, var(--color-inv-accent-text) 55%, var(--color-inv-accent) 100%)' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative z-10 mx-auto max-w-[720px] px-5 py-14 text-center sm:px-8 sm:py-16">
          <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: CYAN }}>Ready to make?</span>
          <h2 className="font-display leading-[1.15] tracking-tight" style={{ fontSize: 'clamp(26px,4vw,42px)', margin: '10px 0 0', color: '#fff' }}>
            Your next project is one click away.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: 'var(--on-dark-muted)' }}>
            Borrow the tools, print your files, or grab materials — everything's ready in the catalog.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button onClick={() => setPage('/catalog')} className="btn-primary text-white" style={{ background: '#fff', color: NAVY }}>
              Browse Inventory <ArrowRight size={14} />
            </button>
            <button onClick={() => setPage('/notifications')} className="btn-secondary text-white"
              style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)' }}>
              <Bell size={14} /> View Notifications
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
