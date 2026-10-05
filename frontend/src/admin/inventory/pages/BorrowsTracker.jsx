import { useState, useMemo } from 'react'
import {
  Search, X, Check, Trash2, Pencil, Coins, Package,
  ArrowUpDown, AlertTriangle, CheckCircle2, Clock, Wrench,
  ChevronDown, User, Calendar, FileText, History as HistoryIcon,
} from 'lucide-react'
import { T } from '../../../lib/inventory/theme'
import { OVERDUE_RATE, CATEGORIES } from '../../../lib/inventory/data'
import { useInventory } from '../../../lib/inventory/InventoryContext'
import { fmtDateTime } from '../../../lib/inventory/datetime'
import OverdueReminderPreview from './OverdueReminderPreview'

const DAY = 86400000
const today = () => new Date().toISOString().split('T')[0]
const daysOverdue = (dueDate) => Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / DAY))
const daysLeft    = (dueDate) => Math.ceil((new Date(dueDate).getTime() - Date.now()) / DAY)
// Borrow dates are full timestamps now; due dates stay date-only. The shared
// formatter renders each accordingly, in Cambodia time.
const fmt = fmtDateTime

const TONE_STYLE = {
  green:  { bg: T.greenLight, fg: T.green },
  danger: { bg: T.redLight,   fg: T.red },
  indigo: { bg: T.purpleLight, fg: T.purple },
}

function StatusBadge({ label, tone }) {
  const s = TONE_STYLE[tone]
  const Icon = label === 'Overdue' ? AlertTriangle : label === 'Returned' ? CheckCircle2 : Clock
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      <Icon size={11} /> {label}
    </span>
  )
}

// Borrow Tracker only ever tracks borrows (never purchases); statuses are
// just Borrowed (running to its deadline), Overdue, and Returned.
function deriveStatus(rec) {
  if (rec.stage === 'returned') return { label: 'Returned', tone: 'green', remaining: '—' }
  const dueDates = rec.activeItems.filter(b => b.dueDate).map(b => b.dueDate)
  if (dueDates.length === 0) return { label: 'Borrowed', tone: 'indigo', remaining: 'No due date set' }
  const soonest = Math.min(...dueDates.map(daysLeft))
  if (soonest < 0) return { label: 'Overdue', tone: 'danger', remaining: `Overdue by ${Math.abs(soonest)} day${Math.abs(soonest) > 1 ? 's' : ''}` }
  if (soonest === 0) return { label: 'Borrowed', tone: 'indigo', remaining: 'Due today' }
  return { label: 'Borrowed', tone: 'indigo', remaining: `Running to deadline · ${soonest} day${soonest > 1 ? 's' : ''} left` }
}

const STATUS_OPTIONS = ['All', 'Borrowed', 'Overdue', 'Returned']

function DetailLabel({ icon: Icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.faint }}>
      <Icon size={12} /> {children}
    </span>
  )
}

function ItemConditionBadge({ item }) {
  if (!item.returned) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: T.purpleLight, color: T.purple, whiteSpace: 'nowrap', flexShrink: 0 }}>
        <Clock size={10} /> Not Returned
      </span>
    )
  }
  const isGood = item.condition === 'Good'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 9px',
      borderRadius: 20, background: isGood ? T.greenLight : T.redLight, color: isGood ? T.green : T.red,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {isGood ? <CheckCircle2 size={10} /> : <Wrench size={10} />} {isGood ? 'Good' : 'Needs Fix'}
    </span>
  )
}

// ── Expanded transaction detail panel ───────────────────────────────────
function TransactionDetail({ r }) {
  return (
    <div onClick={e => e.stopPropagation()} className="bt-detail-grid"
      style={{ background: T.cream, borderBottom: `1px solid ${T.stone}`, padding: '18px 20px 22px', display: 'grid', gridTemplateColumns: '0.85fr 1.3fr 1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <DetailLabel icon={User}>Borrower</DetailLabel>
          <div style={{ fontSize: 12.5, marginTop: 6, color: T.charcoal }}>{r.student?.name || `User #${r.userId}`} <span style={{ color: T.faint }}>· {r.student?.studentId || '—'}</span></div>
        </div>
        <div>
          <DetailLabel icon={Calendar}>Dates</DetailLabel>
          <div style={{ fontSize: 12.5, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--color-charcoal)' }}>
            <span>Borrowed: <strong>{fmt(r.date)}</strong></span>
            {r.stage === 'active' && <span>Due: <strong>{r.activeItems[0]?.dueDate ? fmt(r.activeItems[0].dueDate) : '—'}</strong></span>}
            {r.stage === 'returned' && <span>Returned: <strong>{fmt(r.items.map(i => i.returnDate).filter(Boolean).sort().slice(-1)[0])}</strong></span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <DetailLabel icon={Package}>Items · Category · Qty · Condition</DetailLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {r.items.map((it) => (
              <div key={it.id} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.charcoal }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: T.faint }}>{it.category || '—'} · Qty {it.qty}</div>
                  </div>
                  <ItemConditionBadge item={it} />
                </div>
                {it.returned && it.condition !== 'Good' && it.issue && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: T.red, background: T.redLight, borderRadius: 6, padding: '6px 8px' }}>
                    <strong>Issue reported:</strong> {it.issue}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <DetailLabel icon={HistoryIcon}>Transaction History</DetailLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
          {r.history.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: i === r.history.length - 1 ? 0 : 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-inv-accent)', marginTop: 4 }} />
                {i !== r.history.length - 1 && <span style={{ width: 1.5, flex: 1, background: T.border, marginTop: 3 }} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.charcoal }}>{h.action}</div>
                <div style={{ fontSize: 11, color: T.faint }}>{h.by} · {fmt(h.date)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Borrows Tracker (staff/admin) ────────────────────────────────────────
export default function BorrowsTracker({ borrows, items, users = [], showToast, user }) {
  const ctx = useInventory()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedKey, setExpandedKey] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deducting, setDeducting] = useState(null)
  const [returning, setReturning] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const getUser = (id) => users.find(u => u.id === id)
  const getCategory = (itemId) => { const p = items.find(i => i.id === itemId); return p ? CATEGORIES.find(c => c.id === p.category)?.label : null }

  const toggleExpand = (key) => setExpandedKey(cur => cur === key ? null : key)

  // Group records sharing an orderId into one transaction.
  const groups = useMemo(() => {
    const list = []
    const seen = new Map()
    borrows.forEach(b => {
      const key = b.orderId || `single-${b.id}`
      if (seen.has(key)) { list[seen.get(key)].raw.push(b); return }
      seen.set(key, list.length)
      list.push({ key, userId: b.userId, date: b.date, raw: [b] })
    })
    return list
  }, [borrows])

  // Borrow Tracker only tracks borrows; purchase items are stripped out of
  // every group, and a group made up entirely of purchases is dropped.
  const records = useMemo(() => groups
    .map(g => {
      const borrowRaw = g.raw.filter(b => b.action !== 'purchased')
      if (borrowRaw.length === 0) return null
      const activeItems = borrowRaw.filter(b => b.status === 'active')
      const stage = activeItems.length === 0 ? 'returned' : 'active'
      const itemsList = borrowRaw.map(b => ({
        id: b.id, itemId: b.itemId, name: b.itemName, qty: b.qty || 1, category: getCategory(b.itemId),
        returned: b.status === 'completed',
        condition: b.condition ? (b.condition === 'good' ? 'Good' : b.condition === 'damaged' ? 'Damaged' : 'Maintenance') : null,
        issue: b.issue, dueDate: b.dueDate, returnDate: b.returnDate,
      }))
      const rec = { key: g.key, userId: g.userId, date: g.date, raw: borrowRaw, activeItems, stage, items: itemsList, student: getUser(g.userId) }
      rec.status = deriveStatus(rec)
      rec.history = (() => {
        const h = [{ action: 'Borrowed', by: rec.student?.name || `User #${g.userId}`, date: g.date }]
        itemsList.forEach(it => {
          if (it.returned) h.push({ action: `Returned: ${it.condition || 'Good'} condition${it.issue ? ` (${it.issue})` : ''}`, by: `Staff${user?.name ? `: ${user.name}` : ''}`, date: it.returnDate || g.date })
        })
        return h.sort((a, b) => new Date(a.date) - new Date(b.date))
      })()
      rec.totalQty = itemsList.reduce((s, i) => s + i.qty, 0)
      return rec
    })
    .filter(Boolean)
  , [groups, users, items, user])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = records.filter(r =>
      (statusFilter === 'All' || r.status.label === statusFilter) &&
      (!q ||
        (r.student?.name || '').toLowerCase().includes(q) ||
        (r.student?.studentId || '').toLowerCase().includes(q) ||
        r.items.some(it => it.name.toLowerCase().includes(q)) ||
        r.date.includes(q))
    )
    list = [...list].sort((a, b) => {
      const da = a.activeItems[0]?.dueDate ? new Date(a.activeItems[0].dueDate) : new Date('9999-12-31')
      const db = b.activeItems[0]?.dueDate ? new Date(b.activeItems[0].dueDate) : new Date('9999-12-31')
      return sortDir === 'asc' ? da - db : db - da
    })
    return list
  }, [records, query, statusFilter, sortDir])

  // ── Actions: all persisted through the backend ─────────────────────────
  const confirmReturnGroup = async (rec, itemStates) => {
    const anyIssue = rec.activeItems.some(b => (itemStates[b.id]?.maintenanceQty || 0) > 0)
    try {
      for (const b of rec.activeItems) {
        const state = itemStates[b.id]
        if (!state) continue
        await ctx.returnBorrow(b.id, {
          goodQty: state.goodQty || 0,
          maintenanceQty: state.maintenanceQty || 0,
          notes: state.issue || undefined,
        })
      }
      setReturning(null)
      showToast?.(anyIssue ? 'Items returned. Units needing repair are logged and held back; the rest of the stock stays borrowable.' : 'All items confirmed returned in good condition.')
    } catch (err) {
      showToast?.(err.message || 'Return failed.', 'error')
    }
  }

  const confirmDeduct = async (rec, amount, reason) => {
    if (!amount || amount <= 0) { showToast?.('Enter the credit amount to deduct.', 'error'); return }
    try {
      await ctx.deductCredits({ userId: rec.userId, amount, reason })
      setDeducting(null)
      showToast?.(`Deducted ${amount} credit${amount !== 1 ? 's' : ''} from ${rec.student?.name || 'student'}${reason ? `: ${reason}` : ''}.`)
    } catch (err) {
      showToast?.(err.message || 'Deduction failed.', 'error')
    }
  }

  // Due dates are still set at approval, not edited after the fact — but
  // staff can now actually delete a borrow record (confirm dialog first).
  const saveEdit = () => {
    setEditing(null)
    showToast?.('Borrow records can no longer be edited. Set the due date when approving the request.', 'error')
  }

  const deleteRecord = async (rec) => {
    try {
      for (const b of rec.raw) await ctx.deleteBorrowRecord(b.id)
      setDeleting(null)
      showToast?.(`Deleted ${rec.student?.name || 'this'} record.`)
    } catch (err) {
      showToast?.(err.message || 'Delete failed.', 'error')
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <OverdueReminderPreview />
      <style>{`
        .bt-row { transition: background .12s; cursor: pointer; }
        .bt-row:hover { background: ${T.cream}; }
        .bt-row.expanded { background: var(--color-inv-accent-light); }
        .bt-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 10px; border-radius:8px; font-size:11.5px; font-weight:700; border:none; cursor:pointer; transition:opacity .12s, transform .1s; }
        .bt-btn:hover { transform:translateY(-1px); }
        .bt-btn-return { background:var(--color-inv-accent); color:#fff; }
        .bt-btn-deduct { background:#fff; color:${T.red}; border:1.5px solid color-mix(in oklch, ${T.red} 20%, transparent); }
        .bt-btn-edit { background:#fff; color:${T.charcoal}; border:1.5px solid ${T.border}; }
        .bt-btn-delete { background:#fff; color:${T.red}; border:1.5px solid ${T.border}; }
        .bt-chip { padding:7px 14px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid ${T.border}; background:#fff; color:${T.muted}; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .bt-chip.active { background:${T.charcoal}; color:#fff; border-color:transparent; }
        .bt-chip-scroll { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
        .bt-items-pill { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; color:var(--color-inv-accent); background:color-mix(in oklch, var(--color-inv-accent) 8%, transparent); padding:4px 10px; border-radius:20px; white-space:nowrap; }
        .bt-grid { grid-template-columns: 24px 1.15fr 0.8fr 0.8fr 0.8fr 0.85fr 1fr 1.25fr; }
        .bt-truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bt-cond-chip { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; border:1.5px solid ${T.border}; cursor:pointer; font-size:13px; font-weight:600; flex:1; justify-content:center; transition:all .15s; background:#fff; color:${T.charcoal}; }
        .bt-cond-chip.active-good { border-color:var(--color-inv-accent); background:color-mix(in oklch, var(--color-inv-accent) 7%, transparent); color:var(--color-inv-accent); }
        .bt-cond-chip.active-bad { border-color:${T.red}; background:color-mix(in oklch, ${T.red} 7%, transparent); color:${T.red}; }
        .bt-chevron { transition: transform .15s; color: ${T.faint}; }
        .bt-chevron.open { transform: rotate(180deg); color: ${T.charcoal}; }

        @media (max-width: 1150px) and (min-width: 701px) {
          .bt-grid { grid-template-columns: 20px 1fr 0.7fr 0.7fr 0.7fr 0.8fr 0.9fr 1.1fr; column-gap: 6px; }
          .bt-table-row, .bt-table-head { padding-left: 12px !important; padding-right: 12px !important; }
          .bt-btn { padding: 6px 7px !important; font-size: 10px !important; }
          .bt-btn .bt-btn-label { display: none; }
          .bt-detail-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 700px) {
          .bt-table-head, .bt-table-row { display: none !important; }
          .bt-cards { display: flex !important; }
        }
      `}</style>

      {/* Page title/subtitle live in the shared teal top bar (PAGE_META). */}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '18px 0 12px', flexWrap: 'wrap' }}>
        <div className="bt-chip-scroll" style={{ flex: '1 1 auto', minWidth: 0 }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`bt-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button className="bt-chip" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
            <ArrowUpDown size={12} style={{ marginRight: 4 }} /> Due {sortDir === 'asc' ? '↑' : '↓'}
          </button>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 12, top: 11, color: T.faint }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student, ID, or item…"
              style={{ padding: '9px 14px 9px 32px', borderRadius: 20, border: `1px solid ${T.border}`, fontSize: 12.5, outline: 'none', width: 230, background: '#fff' }} />
          </div>
        </div>
      </div>

      <div style={{ background: T.white, borderRadius: 16, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div className="bt-table-head bt-grid" style={{
          display: 'grid', padding: '12px 20px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
          color: T.faint, background: T.cream, borderBottom: `1px solid ${T.stone}`,
        }}>
          <span></span>
          <span>Student</span>
          <span>Items</span>
          <span>Borrow Date</span>
          <span>Return Date</span>
          <span>Status</span>
          <span>Remaining</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '50px 0', textAlign: 'center', color: T.faint }}>
            <Package size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ fontSize: 13 }}>No borrow records match your filters.</p>
          </div>
        ) : filtered.map(r => (
          <div key={r.key}>
            <div className={`bt-row bt-table-row bt-grid ${expandedKey === r.key ? 'expanded' : ''}`}
              style={{ display: 'grid', padding: '16px 20px', alignItems: 'center', borderBottom: `1px solid ${T.stone}` }}
              onClick={() => toggleExpand(r.key)}>
              <ChevronDown size={14} className={`bt-chevron ${expandedKey === r.key ? 'open' : ''}`} />
              <div style={{ minWidth: 0 }}>
                <div className="bt-truncate" style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{r.student?.name || `User #${r.userId}`}</div>
                <div className="bt-truncate" style={{ fontSize: 11, color: T.faint }}>{r.student?.studentId || ''}</div>
              </div>
              <div>
                <span className="bt-items-pill" title={r.items.map(i => `${i.name} (${i.qty})`).join(', ')}>
                  <Package size={11} /> {r.totalQty} {r.totalQty === 1 ? 'unit' : 'units'}
                </span>
              </div>
              <div className="bt-truncate" style={{ fontSize: 12, color: T.muted }}>{fmt(r.date)}</div>
              <div className="bt-truncate" style={{ fontSize: 12, color: T.muted }}>{r.stage === 'active' ? fmt(r.activeItems[0]?.dueDate) : '—'}</div>
              <div><StatusBadge label={r.status.label} tone={r.status.tone} /></div>
              <div className="bt-truncate" style={{ fontSize: 11.5, fontWeight: 600, color: r.status.tone === 'danger' ? T.red : T.muted }}>{r.status.remaining}</div>
              <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'nowrap' }} onClick={e => e.stopPropagation()}>
                {r.stage === 'active' && (
                  <button className="bt-btn bt-btn-return" onClick={() => setReturning(r)}><Check size={11} /> <span className="bt-btn-label">Return</span></button>
                )}
                {r.status.label === 'Overdue' && (
                  <button className="bt-btn bt-btn-deduct" onClick={() => setDeducting(r)}><Coins size={11} /> <span className="bt-btn-label">Deduct</span></button>
                )}
                {r.stage === 'active' && (
                  <button className="bt-btn bt-btn-edit" onClick={() => setEditing(r)}><Pencil size={11} /></button>
                )}
                <button className="bt-btn bt-btn-delete" onClick={() => setDeleting(r)}><Trash2 size={11} /></button>
              </div>
            </div>
            {expandedKey === r.key && <TransactionDetail r={r} />}
          </div>
        ))}

        {/* mobile cards */}
        <div className="bt-cards" style={{ display: 'none', flexDirection: 'column' }}>
          {filtered.map(r => (
            <div key={r.key}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.stone}`, cursor: 'pointer' }} onClick={() => toggleExpand(r.key)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <ChevronDown size={14} className={`bt-chevron ${expandedKey === r.key ? 'open' : ''}`} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="bt-truncate" style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{r.student?.name || `User #${r.userId}`}</div>
                      <div className="bt-truncate" style={{ fontSize: 11, color: T.faint }}>{r.student?.studentId}</div>
                    </div>
                  </div>
                  <StatusBadge label={r.status.label} tone={r.status.tone} />
                </div>
                <span className="bt-items-pill" style={{ marginBottom: 8, display: 'inline-flex' }}>
                  <Package size={11} /> {r.totalQty} {r.totalQty === 1 ? 'unit' : 'units'}
                </span>
                <div style={{ fontSize: 11.5, color: T.faint, margin: '8px 0' }}>Borrowed {fmt(r.date)}{r.stage === 'active' ? ` · Due ${fmt(r.activeItems[0]?.dueDate)}` : ''}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: r.status.tone === 'danger' ? T.red : 'var(--color-inv-muted)', marginBottom: 10 }}>{r.status.remaining}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  {r.stage === 'active' && <button className="bt-btn bt-btn-return" onClick={() => setReturning(r)}><Check size={11} /> Return</button>}
                  {r.status.label === 'Overdue' && <button className="bt-btn bt-btn-deduct" onClick={() => setDeducting(r)}><Coins size={11} /> Deduct</button>}
                  {r.stage === 'active' && <button className="bt-btn bt-btn-edit" onClick={() => setEditing(r)}><Pencil size={11} /> Edit</button>}
                  <button className="bt-btn bt-btn-delete" onClick={() => setDeleting(r)}><Trash2 size={11} /> Delete</button>
                </div>
              </div>
              {expandedKey === r.key && <TransactionDetail r={r} />}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: T.faint, marginTop: 12 }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''} · sorted by due date ({sortDir === 'asc' ? 'soonest first' : 'latest first'})</p>

      {editing && <EditModal record={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {deducting && <DeductModal record={deducting} onClose={() => setDeducting(null)} onConfirm={confirmDeduct} />}
      {returning && <ReturnModal record={returning} onClose={() => setReturning(null)} onConfirm={confirmReturnGroup} />}
      {deleting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.white, borderRadius: 16, padding: '2rem', width: 340, textAlign: 'center' }}>
            <AlertTriangle size={34} color={T.red} style={{ marginBottom: 12 }} />
            <p style={{ color: T.charcoal, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Delete this record?</p>
            <p style={{ color: T.muted, fontSize: 14, marginBottom: '1.5rem' }}>
              {deleting.student?.name || 'This student'}'s {deleting.totalQty > 1 ? `${deleting.totalQty} items` : 'item'}. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleting(null)} style={{ padding: '9px 20px', background: T.cream, border: 'none', borderRadius: 8, color: T.muted, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deleteRecord(deleting)} style={{ padding: '9px 20px', background: T.red, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Edit modal: per-item due date ───────────────────────────────────────
function EditModal({ record, onClose, onSave }) {
  const [dueDates, setDueDates] = useState(Object.fromEntries(record.activeItems.map(b => [b.id, b.dueDate || ''])))
  const [qtyMap, setQtyMap] = useState(Object.fromEntries(record.activeItems.map(b => [b.id, b.qty || 1])))
  return (
    <ModalShell onClose={onClose} title="Edit Borrow Record" subtitle={record.key}>
      {record.activeItems.map(b => (
        <div key={b.id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.charcoal }}>{b.itemName}</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Return Date</label>
            <input type="date" value={dueDates[b.id]} onChange={e => setDueDates(m => ({ ...m, [b.id]: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Quantity</label>
            <input type="number" min={1} value={qtyMap[b.id]} onChange={e => setQtyMap(m => ({ ...m, [b.id]: Math.max(1, Number(e.target.value)) }))}
              style={{ ...inputStyle, width: 80, textAlign: 'center' }} />
          </div>
        </div>
      ))}
      <button className="bt-btn bt-btn-return" style={{ justifyContent: 'center', padding: '10px 0', fontSize: 13 }} onClick={() => onSave(record, dueDates, qtyMap)}>
        <Check size={13} /> Save Changes
      </button>
    </ModalShell>
  )
}

// ── Manual credit deduction modal ────────────────────────────────────────
function DeductModal({ record, onClose, onConfirm }) {
  const odDays = record.activeItems.filter(b => b.dueDate).reduce((max, b) => Math.max(max, daysOverdue(b.dueDate)), 0)
  const [amount, setAmount] = useState(odDays * OVERDUE_RATE || OVERDUE_RATE)
  const [reason, setReason] = useState('')
  return (
    <ModalShell onClose={onClose} title="Deduct Credits" subtitle={`${record.student?.name || 'Student'} · ${record.student?.studentId || ''}`}>
      <div style={{ display: 'flex', gap: 8, background: T.redLight, color: T.red, fontSize: 12, padding: '9px 12px', borderRadius: 8 }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        This item is overdue ({odDays} day{odDays !== 1 ? 's' : ''}). Suggested penalty at {OVERDUE_RATE} cr/day; adjust as needed.
      </div>
      <div>
        <label style={labelStyle}>Credits to deduct</label>
        <input type="number" min={0} value={amount} onChange={e => setAmount(Math.max(0, Number(e.target.value)))} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Reason (optional, visible to student)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="e.g. Returned 5 days late"
          style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} />
      </div>
      <button className="bt-btn bt-btn-deduct" style={{ justifyContent: 'center', padding: '10px 0', fontSize: 13, background: T.red, color: '#fff', border: 'none' }}
        onClick={() => onConfirm(record, amount, reason)} disabled={amount <= 0}>
        <Coins size={13} /> Deduct {amount} Credit{amount !== 1 ? 's' : ''}
      </button>
    </ModalShell>
  )
}

// ── Return condition modal (per item) ────────────────────────────────────
// Only Good / Maintenance now (Damaged folded into Maintenance). A line
// borrowed as qty > 1 can be split — e.g. 1 good + 1 needing maintenance —
// instead of one condition applying to the whole line.
function ReturnModal({ record, onClose, onConfirm }) {
  const [itemStates, setItemStates] = useState(
    Object.fromEntries(record.activeItems.map(b => [b.id, { goodQty: null, maintenanceQty: 0, issue: '' }]))
  )

  const setGoodQty = (id, qty, total) => setItemStates(m => ({ ...m, [id]: { ...m[id], goodQty: qty, maintenanceQty: total - qty } }))
  const setIssue    = (id, issue)     => setItemStates(m => ({ ...m, [id]: { ...m[id], issue } }))

  const allSet = record.activeItems.every(b => {
    const s = itemStates[b.id]
    const total = b.qty || 1
    const split = s.goodQty !== null && s.goodQty + s.maintenanceQty === total
    return split && (s.maintenanceQty === 0 || s.issue.trim().length > 0)
  })

  return (
    <ModalShell onClose={onClose} title="Return Items" subtitle={`${record.student?.name || 'Student'} · ${record.activeItems.length} item${record.activeItems.length !== 1 ? 's' : ''} to confirm`}>
      {record.activeItems.map(b => {
        const s = itemStates[b.id]
        const total = b.qty || 1
        const needsIssue = s.maintenanceQty > 0
        return (
          <div key={b.id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.charcoal }}>{b.itemName}</div>
              <div style={{ fontSize: 11, color: T.faint }}>Qty {total}</div>
            </div>
            {total === 1 ? (
              <div>
                <label style={labelStyle}>Item Condition</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`bt-cond-chip ${s.goodQty === 1 ? 'active-good' : ''}`} onClick={() => setGoodQty(b.id, 1, total)}>
                    <CheckCircle2 size={14} /> Good
                  </button>
                  <button className={`bt-cond-chip ${s.goodQty === 0 ? 'active-bad' : ''}`} onClick={() => setGoodQty(b.id, 0, total)}>
                    <Wrench size={14} /> Maintenance
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Split by condition (must total {total})</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.green, marginBottom: 4 }}><CheckCircle2 size={12} /> Good</div>
                    <input type="number" min={0} max={total} value={s.goodQty ?? ''} placeholder="0"
                      onChange={e => setGoodQty(b.id, Math.max(0, Math.min(total, Number(e.target.value) || 0)), total)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.red, marginBottom: 4 }}><Wrench size={12} /> Maintenance</div>
                    <div style={{ ...inputStyle, background: T.cream, color: T.muted }}>{s.goodQty !== null ? s.maintenanceQty : '—'}</div>
                  </div>
                </div>
              </div>
            )}
            {needsIssue && (
              <>
                <div>
                  <label style={labelStyle}>Report the Issue</label>
                  <textarea value={s.issue} onChange={e => setIssue(b.id, e.target.value)} rows={2}
                    placeholder="Describe what's wrong with this item…" style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, background: T.amberLight, color: T.amber, fontSize: 11.5, padding: '8px 10px', borderRadius: 8 }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {s.maintenanceQty} unit{s.maintenanceQty !== 1 ? 's' : ''} will be logged for maintenance and held back — the rest of the stock stays available to borrow.
                </div>
              </>
            )}
          </div>
        )
      })}
      <button className="bt-btn bt-btn-return" style={{ justifyContent: 'center', padding: '10px 0', fontSize: 13, opacity: allSet ? 1 : 0.5, cursor: allSet ? 'pointer' : 'not-allowed' }}
        disabled={!allSet} onClick={() => onConfirm(record, itemStates)}>
        <Check size={13} /> Confirm Return{record.activeItems.length > 1 ? ' (All Items)' : ''}
      </button>
    </ModalShell>
  )
}

// ── Shared modal shell ────────────────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.white, borderRadius: 16, maxWidth: 420, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.28)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: T.cream, border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer' }}>
            <X size={16} />
          </button>
          <span style={{ fontSize: 11, color: T.faint }}>{subtitle}</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: T.charcoal }}>{title}</h2>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: T.faint, display: 'block', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, boxSizing: 'border-box' }
