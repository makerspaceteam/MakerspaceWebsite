import { useState } from 'react'
import { Search, Receipt, ChevronDown, Trash2, CheckCircle2, Clock, DollarSign, CreditCard, TrendingUp } from 'lucide-react'
import { StatCard } from '../../components/charts'
import Badge from '../../../components/inventory/ui/Badge'
import { T } from '../../../lib/inventory/theme'
import { CATEGORIES } from '../../../lib/inventory/data'
import { fmtDateTime } from '../../../lib/inventory/datetime'

const PAGE_SIZE = 10
const AVATAR_COLORS = [T.accent, T.teal, T.amber, T.purple, T.blue, T.red]
const avatarColor = (name) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]

const METHOD_FILTERS = ['All', 'Cash', 'Credit']

export default function PaymentsPage({ payments, setPayments, items = [], requests = [], users = [] }) {
  const [search,     setSearch]     = useState('')
  const [methodTab,  setMethodTab]  = useState('All')
  const [dateFilter, setDateFilter] = useState('')
  const [page,       setPage]       = useState(1)
  const [expanded,   setExpanded]   = useState(null)

  const completed = payments.filter(p => p.status === 'Completed')
  // "Pending Payments" isn't a payment record at all yet. It's a credit
  // top-up request still awaiting staff approval in Requests.
  const pendingTopups = requests.filter(r => r.type === 'credit_topup' && r.status === 'pending')

  // Totals breakdown: cash is the USD in-person payments, credit is the
  // internal balance transactions.
  const sumBy = (method, currency) => completed.filter(p => p.method === method && p.currency === currency).reduce((s, p) => s + p.amount, 0)
  const totalCash   = sumBy('Cash', 'USD')
  const totalCredit = completed.filter(p => p.currency === 'CR').reduce((s, p) => s + p.amount, 0)
  // 40 credits per $1 (see CREDIT_RATE); revenue is cash paid plus the
  // dollar-equivalent of credits spent.
  const totalRevenue = totalCash + totalCredit / 40

  const filtered = payments.filter(p =>
    (methodTab === 'All' || p.method === methodTab) &&
    (!dateFilter || p.date === dateFilter) &&
    (p.customerName.toLowerCase().includes(search.toLowerCase()) ||
     p.orderId.toLowerCase().includes(search.toLowerCase()) ||
     String(p.id).includes(search))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Invoices are a permanent financial record; no client-side deletion.
  const remove = null

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* All five stats in one row on desktop: wraps 3+2 on tablet, 2×3 on phone */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Completed Payments" value={completed.length}      icon={CheckCircle2} bg="bg-emerald-50" iconColor="text-emerald-500" to="/admin/inventory/payments" />
        <StatCard label="Pending Payments"   value={pendingTopups.length}  icon={Clock}         bg="bg-amber-50"   iconColor="text-amber-500"   to="/admin/inventory/requests" />
        <StatCard label="Total Cash"         value={`$${totalCash}`}       icon={DollarSign}    bg="bg-blue-50"    iconColor="text-blue-500"    to="/admin/inventory/payments" />
        <StatCard label="Total Credit"       value={`${totalCredit} cr`}   icon={CreditCard}    bg="bg-violet-50"  iconColor="text-violet-500"  to="/admin/inventory/payments" />
        <StatCard label="Total Revenue"      value={`$${totalRevenue.toFixed(2)}`} icon={TrendingUp} bg="bg-teal-50" iconColor="text-teal-500" to="/admin/inventory/payments" />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input placeholder="Search transaction, customer, order…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="w-56 rounded-lg border border-border bg-cream py-2 pl-8 pr-3 text-sm outline-none focus:border-inv-accent sm:w-64" />
            </div>
            <input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-border bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-inv-accent" />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="rounded-lg border border-border bg-white px-2.5 py-2 text-xs font-semibold text-inv-muted">Clear</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {METHOD_FILTERS.map(m => (
              <button key={m} onClick={() => { setMethodTab(m); setPage(1) }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                style={m === methodTab
                  ? { background: T.accent, color: '#fff', border: 'none' }
                  : { background: '#fff', color: T.muted, border: `1px solid ${T.border}` }}>
                {m}
              </button>
            ))}
          </div>
          <span className="text-xs text-faint">{filtered.length} transactions</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-faint">
            <Receipt size={32} strokeWidth={1} className="text-border-dark" />
            <p className="m-0 text-sm">No payment records yet.</p>
          </div>
        ) : visible.map((p) => {
          const isOpen = expanded === p.id
          const isBorrow = p.method === 'Loan'
          const product = items.find(i => i.id === p.itemId || i.name === p.itemName)
          const category = product ? CATEGORIES.find(c => c.id === product.category)?.label : (isBorrow ? 'Borrow' : (p.type || null))
          // Borrowing is never charged; only purchases and credit services show real credit values.
          const unit = isBorrow ? 0 : p.amount
          const total = isBorrow ? 0 : p.amount
          const currency = p.currency === 'USD' ? '$' : ' cr'
          return (
            <div key={p.id} className="border-b border-stone last:border-b-0">
              <button onClick={() => setExpanded(isOpen ? null : p.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream sm:gap-4 sm:px-6">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white sm:h-10 sm:w-10"
                  style={{ background: avatarColor(p.customerName) }}>
                  {p.customerName[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-ink sm:text-sm">{p.customerName}</p>
                  <p className="m-0 mt-0.5 truncate text-xs text-faint sm:text-xs">{p.type} · {fmtDateTime(p.dateTime || p.date)}</p>
                </div>
                <span className="hidden flex-shrink-0 text-sm font-bold text-charcoal sm:block">
                  {isBorrow ? '0 cr' : (p.currency === 'USD' ? `$${p.amount}` : `${p.amount} cr`)}
                </span>
                <div className="flex-shrink-0"><Badge status={p.status === 'Completed' ? 'pay_completed' : p.status === 'Pending' ? 'pay_pending' : 'pay_failed'} small /></div>
                <ChevronDown size={14} className={`flex-shrink-0 text-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              <div className={`grid overflow-hidden transition-all duration-200 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="px-4 pb-4 sm:px-6">
                    <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {[['Transaction ID', `#TXN${String(p.id).slice(-6)}`], ['Method', p.method], ['Order ID', p.orderId]].filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="rounded-md p-2" style={{ background: T.cream }}>
                          <p className="m-0 text-xs uppercase tracking-wide text-faint">{k}</p>
                          <p className="m-0 mt-0.5 truncate text-xs font-semibold text-charcoal">{v}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-stone">
                      <div style={{ minWidth: 480 }}>
                        <div className="grid gap-2 bg-cream px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint" style={{ gridTemplateColumns: '2fr 1.3fr 0.6fr 0.9fr 0.9fr' }}>
                          <span>Item</span><span>Category</span><span>Qty</span><span>Unit Credit</span><span>Total</span>
                        </div>
                        <div className="grid gap-2 px-3 py-2.5 text-xs" style={{ gridTemplateColumns: '2fr 1.3fr 0.6fr 0.9fr 0.9fr' }}>
                          <span className="truncate font-semibold text-charcoal">{p.itemName || p.type}</span>
                          <span className="truncate text-inv-muted">{category || '—'}</span>
                          <span className="text-inv-muted">1</span>
                          <span className="font-semibold text-charcoal">{currency === '$' ? `${currency}${unit}` : `${unit}${currency}`}</span>
                          <span className="font-bold text-charcoal">{currency === '$' ? `${currency}${total}` : `${total}${currency}`}</span>
                        </div>
                      </div>
                    </div>

                    {/* Invoices are a permanent financial record; deletion removed. */}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-stone px-4 py-3 sm:px-6">
          <span className="text-xs text-faint">Showing {visible.length} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-inv-muted disabled:opacity-40">Prev</button>
            <span className="px-2 text-xs text-ink">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-inv-muted disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
