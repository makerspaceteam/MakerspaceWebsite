// Data-access layer for the inventory module. Every function talks to the
// real backend (/api/inventory/*) through the shared hub API client; the
// mappers translate DB rows (snake_case, DB vocab) into the UI shapes the
// components were built around, mirroring toFrontendUser in hub/AuthContext.
import { api, BASE_URL, authFetch } from '../api/client'
import { CATEGORIES } from './data'

// ── Mappers: DB row → UI shape ───────────────────────────────────────────

const categoryIdBySlug = (slug) => CATEGORIES.find((c) => c.id === slug) || null

function categorySlug(categoryName) {
  const match = CATEGORIES.find((c) => c.label === categoryName)
  return match ? match.id : null
}

export function toUiItem(row, catById = {}, locById = {}) {
  const cat = catById[row.category_id]
  const loc = locById[row.location_id]
  return {
    id: row.item_id,
    name: row.item_name,
    description: row.description || '',
    usage: row.usage || '',
    type: row.is_returnable ? 'Returnable' : 'Consumable',
    credits: row.unit_credit ?? 0,
    stock: row.current_stock ?? 0,
    minStock: row.min_stock ?? 0,
    // DB status is only available/unavailable. 'unavailable' is what the
    // backend sets while an item has an open damage report.
    status: row.status === 'unavailable' ? 'maintenance' : 'available',
    condition: row.status === 'unavailable' ? 'Maintenance' : 'Good',
    category: cat ? categorySlug(cat.category_name) : null,
    categoryId: row.category_id,
    locationId: row.location_id,
    zone: loc?.shelf_code || loc?.zone_name || '—',
    room: loc?.location_name || '—',
    borrowCount: 0,
    image: row.image_url || null,
  }
}

export function toDbItem(ui, categories = [], locations = []) {
  const catLabel = categoryIdBySlug(ui.category)?.label
  const category = categories.find((c) => c.category_name === catLabel)
  const location = locations.find((l) => l.shelf_code === ui.zone) || locations.find((l) => l.location_name === ui.room)
  return {
    item_name: ui.name,
    description: ui.description || null,
    is_returnable: ui.type !== 'Consumable',
    unit_credit: Number(ui.credits) || 0,
    current_stock: Number(ui.stock) || 0,
    min_stock: Number(ui.minStock) || 0,
    status: ui.status === 'maintenance' ? 'unavailable' : 'available',
    category_id: ui.categoryId ?? category?.category_id ?? null,
    location_id: ui.locationId ?? location?.location_id ?? null,
    image_url: ui.image || null,
  }
}

export const createLocation = (loc) => api.post('/api/inventory/locations', loc)

// Shelf codes only get saved if they match an existing location_items row,
// the Add/Edit Item form lets staff type any room + shelf code combination,
// so this creates the location on the fly the first time a new one is used,
// instead of silently dropping it (which showed "—" for zone/room).
export async function resolveLocation({ room, zone }, locations = []) {
  if (!zone?.trim()) return locations.find((l) => l.location_name === room) || null
  const code = zone.trim()
  const existing = locations.find((l) => l.shelf_code === code)
  if (existing) return existing
  const zonePrefix = code.match(/^[A-Za-z]+/)?.[0] || code
  const { data } = await createLocation({
    location_name: room || 'Makerspace Room',
    zone_name: `Zone ${zonePrefix}`,
    shelf_code: code,
  })
  return data
}

export function toUiBorrow(row) {
  const ret = Array.isArray(row.return_transactions) ? row.return_transactions[0] : null
  return {
    id: row.borrow_id,
    userId: row.user_id,
    itemId: row.item_id,
    itemName: row.inventory_items?.item_name || '—',
    action: row.status === 'returned' ? 'returned' : 'borrowed',
    qty: row.quantity_borrow,
    // Full timestamps (not date-only): borrow_date/return_date are real
    // moments (when staff approved/processed it), shown with time on the
    // notifications feed. dueDate stays date-only, it's a day-level
    // deadline, not a specific moment.
    date: row.borrow_date,
    dueDate: (row.due_date || '').slice(0, 10) || null,
    returnDate: ret ? ret.return_date : null,
    status: row.status === 'returned' ? 'completed' : 'active',
    overdue: row.status !== 'returned' && row.due_date && new Date(row.due_date) < new Date(),
    condition: ret?.is_damaged ? 'Damaged' : 'Good',
    approvedBy: row.approved_by,
    orderId: row.order_id,
  }
}

export function toUiRequest(row) {
  return {
    id: row.request_id,
    userId: row.user_id,
    itemId: row.item_id,
    itemName: row.inventory_items?.item_name || null,
    type: row.request_type,
    status: row.status,
    date: row.created_at,
    // requests.updated_at only changes on approve/deny (see
    // approveBorrowGroup/denyRequestGroup/etc. in inventory.controller.js),
    // so once the request is no longer pending it's the approval/denial time.
    approvedAt: row.status !== 'pending' ? row.updated_at : null,
    qty: row.quantity,
    dueDate: row.due_date,
    amountUSD: row.amount_usd != null ? Number(row.amount_usd) : null,
    credits: row.credits,
    pages: row.pages,
    grams: row.grams,
    filamentId: row.filament_id,
    filamentName: row.filaments ? `${row.filaments.name} ${row.filaments.color || ''}`.trim() : null,
    orderId: row.order_id,
    note: row.note,
  }
}

export function toUiNotification(row) {
  return {
    id: row.notification_id,
    type: row.notification_type,
    message: row.message,
    read: row.is_read,
    date: row.created_at,
    userId: row.user_id,
  }
}

export function toUiFilament(row) {
  return {
    id: row.filament_id,
    name: row.name,
    color: row.color,
    hex: row.hex,
    stockGrams: row.stock_grams,
    rate: row.rate,
  }
}

// ── Fetchers ─────────────────────────────────────────────────────────────

export async function fetchCatalog() {
  const [items, categories, locations, filaments] = await Promise.all([
    api.get('/api/inventory/items'),
    api.get('/api/inventory/categories'),
    api.get('/api/inventory/locations'),
    api.get('/api/inventory/filaments'),
  ])
  const catById = Object.fromEntries(categories.data.map((c) => [c.category_id, c]))
  const locById = Object.fromEntries(locations.data.map((l) => [l.location_id, l]))
  return {
    items: items.data.map((r) => toUiItem(r, catById, locById)),
    filaments: filaments.data.map(toUiFilament),
    categories: categories.data,
    locations: locations.data,
  }
}

export const fetchBorrows = () => api.get('/api/inventory/borrows').then((r) => r.data.map(toUiBorrow))
export const fetchRequests = () => api.get('/api/inventory/requests').then((r) => r.data.map(toUiRequest))
export const fetchNotifications = () => api.get('/api/inventory/notifications').then((r) => r.data.map(toUiNotification))
export const fetchPayments = () => api.get('/api/inventory/payments').then((r) => r.data) // pre-flattened
export const fetchUsers = () => api.get('/api/inventory/users').then((r) => r.data.map((u) => ({ ...u, permissions: [] })))

// ── Student actions ──────────────────────────────────────────────────────

// lines: [{ itemId, qty, dueDate?, note? }], one request row per item,
// grouped by a shared order id so staff can approve the cart together.
export async function submitBorrowRequests(lines) {
  const orderId = `ORD-${Date.now()}`
  for (const l of lines) {
    await api.post('/api/inventory/requests', {
      request_type: 'borrow', item_id: l.itemId, quantity: l.qty || 1,
      due_date: l.dueDate || null, note: l.note || null, order_id: orderId,
    })
  }
  return orderId
}

export const submitTopUpRequest = ({ amountUSD, note }) =>
  api.post('/api/inventory/requests', { request_type: 'credit_topup', amount_usd: amountUSD, note: note || null })

export const submitPrintingRequest = ({ pages, credits, note }) =>
  api.post('/api/inventory/requests', { request_type: 'printing', pages, credits, note: note || null })

export const submit3DPrintRequest = ({ filamentId, note }) =>
  api.post('/api/inventory/requests', { request_type: '3d_printing', filament_id: filamentId, note: note || null })

// cart: [{ itemId, qty }], consumables only. No longer charged instantly:
// each line becomes a pending 'purchase' request (shared order id) and
// credits/stock only move when staff approve it in Request Management.
export async function purchaseItems(cart) {
  const orderId = `ORD-${Date.now()}`
  for (const l of cart) {
    await api.post('/api/inventory/requests', {
      request_type: 'purchase', item_id: l.itemId, quantity: l.qty || 1, order_id: orderId,
    })
  }
  return orderId
}

// ── Staff actions ────────────────────────────────────────────────────────

export const approveBorrowGroup = (requestIds) => api.post('/api/inventory/requests/approve-borrow', { requestIds })
export const approvePurchaseGroup = (requestIds) => api.post('/api/inventory/requests/approve-purchase', { requestIds })
export const denyRequests = (requestIds) => api.post('/api/inventory/requests/deny', { requestIds })
export const deleteRequestGroup = (requestIds) => api.post('/api/inventory/requests/delete', { requestIds })
export const approveTopUp = (requestId) => api.post(`/api/inventory/requests/${requestId}/approve-topup`)
export const approvePrinting = (requestId) => api.post(`/api/inventory/requests/${requestId}/approve-printing`)
export const confirm3DWeight = (requestId, grams) => api.post(`/api/inventory/requests/${requestId}/confirm-3d-weight`, { grams })
export const returnBorrow = (borrowId, { goodQty = 0, maintenanceQty = 0, notes } = {}) =>
  api.post(`/api/inventory/borrows/${borrowId}/return`, { goodQty, maintenanceQty, notes })
export const deleteBorrowRecord = (borrowId) => api.del(`/api/inventory/borrows/${borrowId}`)
export const fetchMaintenanceQuantities = () => api.get('/api/inventory/maintenance-quantities').then((r) => r.data)
export const deductCredits = ({ userId, amount, reason }) =>
  api.post('/api/inventory/borrows/deduct-credits', { userId, amount, reason })
export const chargePrint = ({ studentId, pages, rate }) =>
  api.post('/api/inventory/services/print', { studentId, pages, rate })
export const charge3D = ({ studentId, filamentId, grams, machineId, hours }) =>
  api.post('/api/inventory/services/3d-print', { studentId, filamentId, grams, machineId, hours })
export const chargeMachineTime = ({ studentId, itemId, hours, materialCost }) =>
  api.post('/api/inventory/services/machine-time', { studentId, itemId, hours, materialCost })
export const staffSale = ({ studentId, cart }) => api.post('/api/inventory/sale', { studentId, cart })
export const topUpCounter = ({ studentId, amountUSD, method, type }) =>
  api.post('/api/inventory/topup-counter', { studentId, amountUSD, method, type })

// ── Item / filament CRUD (staff) ─────────────────────────────────────────

export const createItem = (dbItem) => api.post('/api/inventory/items', dbItem)
export const updateItem = (itemId, dbItem) => api.put(`/api/inventory/items/${itemId}`, dbItem)
export const deleteItem = (itemId) => api.del(`/api/inventory/items/${itemId}`)
export const reportMaintenance = (itemId, { notes, quantityDamaged } = {}) =>
  api.post(`/api/inventory/items/${itemId}/report-maintenance`, { notes, quantityDamaged })
export const completeMaintenance = (itemId) => api.post(`/api/inventory/items/${itemId}/maintenance-complete`)
// { itemId -> { notes, quantityDamaged, reportedAt } }, the open issue
// behind each item currently flagged unavailable/Maintenance.
export const fetchOpenMaintenance = () =>
  api.get('/api/inventory/maintenance-open').then((r) =>
    Object.fromEntries(r.data.map((l) => [l.item_id, { notes: l.notes, quantityDamaged: l.quantity_damaged, reportedAt: l.reported_at }])))

export const createFilament = (f) =>
  api.post('/api/inventory/filaments', { name: f.name, color: f.color, hex: f.hex, stock_grams: f.stockGrams ?? 0, rate: f.rate ?? 4 })
export const updateFilament = (id, f) =>
  api.put(`/api/inventory/filaments/${id}`, { name: f.name, color: f.color, hex: f.hex, stock_grams: f.stockGrams, rate: f.rate })
export const deleteFilament = (id) => api.del(`/api/inventory/filaments/${id}`)

// ── Lab Services CRUD (staff) — what shows as a service card on the Lab
// Service page. `s` uses DB column names directly (name, description,
// pricing_type, linked_item_id, config, image_url, is_active, sort_order),
// same convention as createFilament above.
export const fetchLabServices = () => api.get('/api/inventory/lab-services').then((r) => r.data)
export const createLabService = (s) => api.post('/api/inventory/lab-services', s)
// Strip `id` before sending — the table's real PK column is service_id, not
// id, so an `id` field in the body makes Supabase try to update a column
// that doesn't exist ("could not find the 'id' column of 'lab_services'").
export const updateLabService = (id, s) => { const { id: _omit, ...rest } = s; return api.put(`/api/inventory/lab-services/${id}`, rest) }
export const deleteLabService = (id) => api.del(`/api/inventory/lab-services/${id}`)

// Multipart upload: the JSON client can't carry files, so this goes through
// fetch directly with the same bearer token. Returns the public image URL.
export async function uploadItemImage(file) {
  const form = new FormData()
  form.append('image', file)
  const res = await authFetch(`/api/inventory/items/upload-image`, {
    method: 'POST',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`)
  return data.data.url
}

// ── Notifications ────────────────────────────────────────────────────────

export const markNotificationRead = (id) => api.post(`/api/inventory/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/api/inventory/notifications/read-all')
