import { supabaseAdmin } from "../../config/supabaseClient.js";
import { adjustCredits, getMembershipByUserId, CreditsError } from "../../shared/credits.js";
import { normalizeRow } from "../../shared/normalizeTimestamps.js";
import { parseQuantity } from "../../shared/quantity.js";

const CREDIT_RATE = 40;               // credits granted per $1 topped up
const MEMBERSHIP_PLAN = { price: 20, bonusCredits: 200 };
const OVERDUE_RATE = 5;               // credits charged per day late (message only)
const DEFAULT_BORROW_DAYS = 7;

const isStaff = (user) => user.role === "admin" || user.role === "staff";

function creditsErrorToResponse(err, res) {
  if (err instanceof CreditsError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + DEFAULT_BORROW_DAYS);
  return due.toISOString();
}

async function getUserById(userId) {
  const { data, error } = await supabaseAdmin
    .from("users").select("user_id, full_name, student_id, email, status")
    .eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function insertNotification({ userId, type, message, dedupKey = null }) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId, notification_type: type, message, is_read: false, dedup_key: dedupKey,
  });
  if (error) throw error;
}

// One paid invoice + its payment row (and optional purchase_items lines),
// the real schema's equivalent of the old flat "payments" record. Everything
// the counter/approval flows create is already settled, so status is 'paid'.
async function createPaidInvoice({ userId, invoiceType, totalCredit = 0, totalAmount = 0, method, verifiedBy, lines = [] }) {
  const { data: invoice, error: invErr } = await supabaseAdmin
    .from("invoices")
    .insert({
      user_id: userId, invoice_type: invoiceType,
      total_credit: totalCredit, total_amount: Math.round(totalAmount),
      status: "paid", payment_method: method, verified_by: verifiedBy,
    })
    .select().single();
  if (invErr) throw invErr;

  if (lines.length) {
    const { error: lineErr } = await supabaseAdmin.from("purchase_items").insert(
      lines.map((l) => ({
        invoice_id: invoice.invoice_id, item_id: l.itemId,
        quantity: l.quantity, unit_price: l.unitPrice, subtotal: l.quantity * l.unitPrice,
      }))
    );
    if (lineErr) throw lineErr;
  }

  const { error: payErr } = await supabaseAdmin.from("payments").insert({
    invoice_id: invoice.invoice_id, payment_method: method,
    amount_paid: totalAmount > 0 ? Math.round(totalAmount) : totalCredit,
    payment_status: "paid", paid_at: new Date().toISOString(),
    transaction_id: `${(invoiceType || "inv").toUpperCase()}-${invoice.invoice_id}`,
  });
  if (payErr) throw payErr;

  return invoice;
}

async function changeStock(itemId, delta) {
  const { data: item, error: readErr } = await supabaseAdmin
    .from("inventory_items").select("item_id, item_name, current_stock").eq("item_id", itemId).single();
  if (readErr) throw readErr;
  const next = item.current_stock + delta;
  if (next < 0) throw new CreditsError(`Not enough stock of "${item.item_name}" (has ${item.current_stock})`);
  const { error: updErr } = await supabaseAdmin
    .from("inventory_items").update({ current_stock: next, updated_at: new Date().toISOString() })
    .eq("item_id", itemId);
  if (updErr) throw updErr;
  return item;
}

// ── Lists ────────────────────────────────────────────────────────────────

export async function listBorrows(req, res, next) {
  try {
    let query = supabaseAdmin
      .from("borrow_transactions")
      .select("*, inventory_items(item_name, unit_credit, is_returnable), return_transactions(*)")
      .order("borrow_date", { ascending: false });
    if (!isStaff(req.user)) query = query.eq("user_id", req.user.user_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data.map(normalizeRow) });
  } catch (err) { next(err); }
}

export async function listRequests(req, res, next) {
  try {
    let query = supabaseAdmin
      .from("requests")
      .select("*, inventory_items(item_name, unit_credit), filaments(name, color, rate)")
      .order("created_at", { ascending: false });
    if (!isStaff(req.user)) query = query.eq("user_id", req.user.user_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data.map(normalizeRow) });
  } catch (err) { next(err); }
}

const INVOICE_TYPE_LABELS = {
  item_purchase: "Item Purchase", credit_topup: "Membership Credit Top-Up",
  membership: "Membership Activation", printing: "Document Printing",
  "3d_printing": "3D Printing", fee: "Late/Damage Fee",
};

// Staff-only. Flattened for the admin Payments page: one row per invoice.
export async function listPayments(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, users!invoices_user_id_fkey(full_name, student_id), payments(*), purchase_items(quantity, unit_price, subtotal, inventory_items(item_name))")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = data.map((inv) => ({
      id: inv.invoice_id,
      orderId: `INV-${inv.invoice_id}`,
      customerName: inv.users?.full_name || "—",
      customerId: inv.users?.student_id || null,
      date: (inv.created_at || "").slice(0, 10),
      dateTime: inv.created_at || null,
      amount: inv.total_amount > 0 ? inv.total_amount : inv.total_credit,
      currency: inv.total_amount > 0 ? "USD" : "CR",
      method: inv.payment_method ? inv.payment_method[0].toUpperCase() + inv.payment_method.slice(1) : "—",
      status: inv.status === "paid" ? "Completed" : inv.status === "cancelled" ? "Cancelled" : "Pending",
      type: INVOICE_TYPE_LABELS[inv.invoice_type] || inv.invoice_type || "Payment",
      itemName: (inv.purchase_items || []).map((p) => p.inventory_items?.item_name).filter(Boolean).join(", ") || null,
      items: inv.purchase_items || [],
    }));
    res.json({ data: rows });
  } catch (err) { next(err); }
}

// Staff-only. Student directory with membership/credits for the counter UIs.
export async function listInventoryUsers(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("user_id, full_name, email, student_id, role, status, memberships!memberships_user_id_fkey(membership_status, credits)")
      .order("full_name");
    if (error) throw error;
    const rows = data.map((u) => ({
      id: u.user_id, name: u.full_name, email: u.email, studentId: u.student_id,
      role: u.role, status: u.status,
      membership: u.memberships?.[0]?.membership_status === "active" ? "active" : "inactive",
      credits: u.memberships?.[0]?.credits ?? 0,
    }));
    res.json({ data: rows });
  } catch (err) { next(err); }
}

// ── Requests ─────────────────────────────────────────────────────────────

const REQUEST_FIELDS = {
  borrow: ["item_id", "quantity", "due_date", "note", "order_id"],
  // Self-purchases wait for staff approval too. Credits/stock only move
  // when the request is approved (see approvePurchaseGroup).
  purchase: ["item_id", "quantity", "note", "order_id"],
  credit_topup: ["amount_usd", "note"],
  printing: ["pages", "credits", "note"],
  "3d_printing": ["filament_id", "note"],
};

export async function createRequest(req, res, next) {
  try {
    const { request_type } = req.body;
    const allowed = REQUEST_FIELDS[request_type];
    if (!allowed) return res.status(400).json({ error: "Invalid request_type" });
    // Both print services are walk-up only; staff charge them at the counter
    // (chargePrintingNow / charge3DNow) once the student is physically
    // present, so there's no remote request queue for either.
    if (request_type === "printing" || request_type === "3d_printing") {
      return res.status(400).json({ error: "Print services must be requested in person at the makerspace." });
    }

    const payload = { user_id: req.user.user_id, request_type, status: "pending" };
    for (const f of allowed) if (req.body[f] !== undefined) payload[f] = req.body[f];

    if ((request_type === "borrow" || request_type === "purchase") && !payload.item_id) return res.status(400).json({ error: "item_id is required" });
    if (request_type === "borrow" || request_type === "purchase") {
      const qty = parseQuantity(payload.quantity);
      if (qty === null) return res.status(400).json({ error: "quantity must be a whole number from 1 to 1000" });
      payload.quantity = qty;
    }
    if (request_type === "credit_topup") {
      const amount = Number(payload.amount_usd);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return res.status(400).json({ error: "amount_usd must be a positive number up to 10000" });
      payload.amount_usd = amount;
    }
    if (request_type === "credit_topup" && !(payload.amount_usd > 0)) return res.status(400).json({ error: "amount_usd must be positive" });
    if (request_type === "printing" && !(payload.pages > 0)) return res.status(400).json({ error: "pages must be positive" });
    if (request_type === "3d_printing" && !payload.filament_id) return res.status(400).json({ error: "filament_id is required" });

    const { data, error } = await supabaseAdmin.from("requests").insert(payload).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

// Approve every borrow request in one cart together: borrow_transactions row
// + stock decrement per item, then one notification.
export async function approveBorrowGroup(req, res, next) {
  try {
    const { requestIds } = req.body;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ error: "requestIds is required" });
    }

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from("requests").select("*, inventory_items(item_name)")
      .in("request_id", requestIds).eq("request_type", "borrow").eq("status", "pending");
    if (reqErr) throw reqErr;
    if (!requests.length) return res.status(404).json({ error: "No matching pending borrow requests" });

    if (requests.some((r) => parseQuantity(r.quantity) === null)) {
      return res.status(400).json({ error: "A request in this group has an invalid quantity; deny it instead" });
    }
    for (const r of requests) {
      const qty = parseQuantity(r.quantity);
      await changeStock(r.item_id, -qty);
      const { error: borrowErr } = await supabaseAdmin.from("borrow_transactions").insert({
        user_id: r.user_id, item_id: r.item_id, quantity_borrow: qty,
        due_date: r.due_date || defaultDueDate(),      // NOT NULL in schema
        approved_by: req.user.user_id, status: "borrowed", order_id: r.order_id,
      });
      if (borrowErr) throw borrowErr;
    }

    const { error: statusErr } = await supabaseAdmin
      .from("requests").update({ status: "approved", approved_by: req.user.user_id, updated_at: new Date().toISOString() })
      .in("request_id", requests.map((r) => r.request_id));
    if (statusErr) throw statusErr;

    const names = requests.map((r) => r.inventory_items?.item_name).filter(Boolean).join(", ");
    await insertNotification({
      userId: requests[0].user_id, type: "approved",
      message: `Your borrowing request has been approved: ${names || "your items"}.`,
    });

    res.json({ data: { approved: requests.length } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// Approve every purchase request in one cart together. This is the moment
// credits are deducted and stock is reduced (the request itself charged
// nothing). One invoice covers the whole cart, then one notification.
export async function approvePurchaseGroup(req, res, next) {
  try {
    const { requestIds } = req.body;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ error: "requestIds is required" });
    }

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from("requests").select("*, inventory_items(item_name, unit_credit)")
      .in("request_id", requestIds).eq("request_type", "purchase").eq("status", "pending");
    if (reqErr) throw reqErr;
    if (!requests.length) return res.status(404).json({ error: "No matching pending purchase requests" });

    if (requests.some((r) => parseQuantity(r.quantity) === null)) {
      return res.status(400).json({ error: "A request in this group has an invalid quantity; deny it instead" });
    }
    const userId = requests[0].user_id;
    if (requests.some((r) => r.user_id !== userId)) {
      return res.status(400).json({ error: "All requests in a group must belong to the same user" });
    }
    const lines = requests.map((r) => ({
      itemId: r.item_id, quantity: parseQuantity(r.quantity),
      unitPrice: r.inventory_items?.unit_credit ?? 0,
    }));
    const totalCredits = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    // Charge first: if the student can't afford it, nothing else happens.
    await adjustCredits(userId, -totalCredits, {
      description: `Approved purchase ${requests[0].order_id || requests[0].request_id}`,
    });

    for (const l of lines) await changeStock(l.itemId, -l.quantity);

    await createPaidInvoice({
      userId, invoiceType: "item_purchase", totalCredit: totalCredits,
      method: "credit", verifiedBy: req.user.user_id, lines,
    });

    const { error: statusErr } = await supabaseAdmin
      .from("requests").update({ status: "approved", approved_by: req.user.user_id, updated_at: new Date().toISOString() })
      .in("request_id", requests.map((r) => r.request_id));
    if (statusErr) throw statusErr;

    const names = requests.map((r) => r.inventory_items?.item_name).filter(Boolean).join(", ");
    await insertNotification({
      userId, type: "approved",
      message: `Your purchase has been approved: ${names || "your items"} (${totalCredits} cr deducted).`,
    });

    res.json({ data: { approved: requests.length, creditsCharged: totalCredits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

export async function denyRequestGroup(req, res, next) {
  try {
    const { requestIds } = req.body;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ error: "requestIds is required" });
    }

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from("requests").select("*").in("request_id", requestIds).eq("status", "pending");
    if (reqErr) throw reqErr;
    if (!requests.length) return res.status(404).json({ error: "No matching pending requests" });

    const { error } = await supabaseAdmin
      .from("requests").update({ status: "denied", approved_by: req.user.user_id, updated_at: new Date().toISOString() })
      .in("request_id", requests.map((r) => r.request_id));
    if (error) throw error;

    const first = requests[0];
    const message =
      first.request_type === "credit_topup" ? `Your $${first.amount_usd} credit top-up request has been rejected.`
      : first.request_type === "printing" ? "Your printing request has been rejected."
      : first.request_type === "3d_printing" ? "Your 3D print job request has been rejected."
      : first.request_type === "purchase" ? "Your purchase request has been rejected."
      : "Your borrowing request has been rejected.";
    await insertNotification({ userId: first.user_id, type: "denied", message });

    res.json({ data: { denied: requests.length } });
  } catch (err) { next(err); }
}

// Clears already-resolved requests off the list. Staff only, and only once
// a request is no longer pending (approving/denying is the only way to
// resolve a live request; this never lets one disappear unactioned).
export async function deleteRequestGroup(req, res, next) {
  try {
    const { requestIds } = req.body;
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ error: "requestIds is required" });
    }

    const { data: requests, error: readErr } = await supabaseAdmin
      .from("requests").select("request_id, status").in("request_id", requestIds);
    if (readErr) throw readErr;
    if (!requests.length) return res.status(404).json({ error: "No matching requests" });
    if (requests.some((r) => r.status === "pending")) {
      return res.status(400).json({ error: "Approve or decline a request before deleting it" });
    }

    const { error } = await supabaseAdmin.from("requests").delete().in("request_id", requests.map((r) => r.request_id));
    if (error) throw error;

    res.json({ data: { deleted: requests.length } });
  } catch (err) { next(err); }
}

// ── Returns & fees ───────────────────────────────────────────────────────

// goodQty of the returned quantity goes straight back into current_stock;
// maintenanceQty does NOT — it's logged as an open maintenance_logs entry
// instead (quantity_damaged), so only those specific units are held back.
// The rest of current_stock — including every other unit already in the
// building — stays borrowable; a maintenance report on part of a return no
// longer flips the whole item to "unavailable" the way it used to.
export async function returnBorrow(req, res, next) {
  try {
    const { goodQty = 0, maintenanceQty = 0, notes } = req.body;
    const good = Number(goodQty) || 0;
    const maintenance = Number(maintenanceQty) || 0;
    if (good < 0 || maintenance < 0 || good + maintenance <= 0) {
      return res.status(400).json({ error: "goodQty and maintenanceQty must be non-negative and sum to more than 0" });
    }

    const { data: borrow, error: readErr } = await supabaseAdmin
      .from("borrow_transactions").select("*, inventory_items(item_name)")
      .eq("borrow_id", req.params.id).single();
    if (readErr) throw readErr;
    if (borrow.status === "returned") return res.status(409).json({ error: "Already returned" });

    const qty = good + maintenance;
    if (qty > borrow.quantity_borrow) {
      return res.status(400).json({ error: `Returned quantity (${qty}) exceeds the ${borrow.quantity_borrow} borrowed` });
    }

    const { error: retErr } = await supabaseAdmin.from("return_transactions").insert({
      borrow_id: borrow.borrow_id, quantity_returned: qty,
      is_damaged: maintenance > 0, notes: notes || null, received_by: req.user.user_id,
    });
    if (retErr) throw retErr;

    const { error: updErr } = await supabaseAdmin
      .from("borrow_transactions").update({ status: "returned" }).eq("borrow_id", borrow.borrow_id);
    if (updErr) throw updErr;

    if (good > 0) await changeStock(borrow.item_id, good);

    if (maintenance > 0) {
      const { error: maintErr } = await supabaseAdmin.from("maintenance_logs").insert({
        item_id: borrow.item_id, reported_by: req.user.user_id,
        quantity_damaged: maintenance, notes: notes || "Returned needing maintenance",
      });
      if (maintErr) throw maintErr;
    }

    res.json({ data: { returned: true } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// Borrow history used to be a permanent, undeletable ledger; staff now want
// a real delete (with the confirm dialog already in the UI). Any linked
// return_transactions rows are cleared first since they FK to this one.
export async function deleteBorrowRecord(req, res, next) {
  try {
    const { data: borrow, error: readErr } = await supabaseAdmin
      .from("borrow_transactions").select("borrow_id").eq("borrow_id", req.params.id).maybeSingle();
    if (readErr) throw readErr;
    if (!borrow) return res.status(404).json({ error: "Borrow record not found" });

    const { error: retDelErr } = await supabaseAdmin
      .from("return_transactions").delete().eq("borrow_id", borrow.borrow_id);
    if (retDelErr) throw retDelErr;

    const { error: delErr } = await supabaseAdmin
      .from("borrow_transactions").delete().eq("borrow_id", borrow.borrow_id);
    if (delErr) throw delErr;

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Total units of an item currently sitting in maintenance — the sum of open
// (unresolved) maintenance_logs entries. Not a stored column: derived live
// so it can never drift from the actual open-log state.
export async function getMaintenanceQuantities(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("maintenance_logs").select("item_id, quantity_damaged").is("resolved_at", null);
    if (error) throw error;
    const byItem = {};
    for (const row of data) byItem[row.item_id] = (byItem[row.item_id] || 0) + (row.quantity_damaged || 1);
    res.json({ data: byItem });
  } catch (err) {
    next(err);
  }
}

export async function deductCredits(req, res, next) {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: "userId and a positive amount are required" });
    }

    const membership = await adjustCredits(userId, -amount, {
      description: reason || "Late/damage fee",
    });
    await createPaidInvoice({
      userId, invoiceType: "fee", totalCredit: amount, method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId, type: "fee_charged",
      message: reason || `${amount} credits were deducted from your account.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// ── Request approvals that move credits ──────────────────────────────────

async function getPendingRequest(id, type) {
  const { data, error } = await supabaseAdmin
    .from("requests").select("*").eq("request_id", id).eq("request_type", type).eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markApproved(requestId, approvedBy, extra = {}) {
  const { error } = await supabaseAdmin
    .from("requests")
    .update({ status: "approved", approved_by: approvedBy, updated_at: new Date().toISOString(), ...extra })
    .eq("request_id", requestId);
  if (error) throw error;
}

export async function approveTopUp(req, res, next) {
  try {
    const r = await getPendingRequest(req.params.id, "credit_topup");
    if (!r) return res.status(404).json({ error: "No pending top-up request with that id" });

    const creditsToAdd = Math.round(Number(r.amount_usd) * CREDIT_RATE);
    const membership = await adjustCredits(r.user_id, creditsToAdd, {
      sourceType: "membership", sourceId: r.request_id,
      description: `Credit top-up $${r.amount_usd}`,
    });

    await markApproved(r.request_id, req.user.user_id);
    await createPaidInvoice({
      userId: r.user_id, invoiceType: "credit_topup", totalAmount: Number(r.amount_usd),
      method: "cash", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: r.user_id, type: "approved",
      message: `Your payment has been completed: $${r.amount_usd} → +${creditsToAdd} credits.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

export async function approvePrinting(req, res, next) {
  try {
    const r = await getPendingRequest(req.params.id, "printing");
    if (!r) return res.status(404).json({ error: "No pending printing request with that id" });

    const charge = r.credits || 0;
    const membership = await adjustCredits(r.user_id, -charge, {
      sourceId: r.request_id, description: `Document printing (${r.pages} pages)`,
    });

    await markApproved(r.request_id, req.user.user_id);
    await createPaidInvoice({
      userId: r.user_id, invoiceType: "printing", totalCredit: charge,
      method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: r.user_id, type: "approved",
      message: `Your print job is ready: ${r.pages} page${r.pages === 1 ? "" : "s"} printed, ${charge} cr charged.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

export async function confirm3DWeight(req, res, next) {
  try {
    const { grams } = req.body;
    if (!grams || grams <= 0) return res.status(400).json({ error: "grams must be a positive number" });

    const r = await getPendingRequest(req.params.id, "3d_printing");
    if (!r) return res.status(404).json({ error: "No pending 3D print request with that id" });

    const { data: filament, error: filErr } = await supabaseAdmin
      .from("filaments").select("*").eq("filament_id", r.filament_id).maybeSingle();
    if (filErr) throw filErr;
    const rate = filament?.rate ?? 4;
    const credits = Math.round(grams * rate);

    const membership = await adjustCredits(r.user_id, -credits, {
      sourceId: r.request_id, description: `3D printing ${grams}g ${filament?.name || ""}`.trim(),
    });

    await markApproved(r.request_id, req.user.user_id, { grams, credits });

    if (filament) {
      const { error: stockErr } = await supabaseAdmin
        .from("filaments")
        .update({ stock_grams: Math.max(0, filament.stock_grams - grams), updated_at: new Date().toISOString() })
        .eq("filament_id", filament.filament_id);
      if (stockErr) throw stockErr;
    }

    await createPaidInvoice({
      userId: r.user_id, invoiceType: "3d_printing", totalCredit: credits,
      method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: r.user_id, type: "approved",
      message: `Your 3D print is ready: ${grams}g used, ${credits} cr charged.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// ── Walk-up counter (instant charge, no request row) ─────────────────────

export async function chargePrintingNow(req, res, next) {
  try {
    const { studentId, pages, rate = 2 } = req.body;
    if (!studentId || !pages || pages <= 0) return res.status(400).json({ error: "studentId and positive pages are required" });

    const credits = Math.round(pages * rate);
    const membership = await adjustCredits(studentId, -credits, {
      description: `Document printing (${pages} pages, walk-up)`,
    });

    await createPaidInvoice({
      userId: studentId, invoiceType: "printing", totalCredit: credits,
      method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: studentId, type: "approved",
      message: `Staff printed ${pages} page(s) for you: ${credits} cr charged.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

export async function charge3DNow(req, res, next) {
  try {
    const { studentId, filamentId, grams, machineId, hours = 0 } = req.body;
    if (!studentId || !grams || grams <= 0) return res.status(400).json({ error: "studentId and positive grams are required" });

    const { data: filament, error: filErr } = await supabaseAdmin
      .from("filaments").select("*").eq("filament_id", filamentId).maybeSingle();
    if (filErr) throw filErr;
    const rate = filament?.rate ?? 4;

    // Machine time, same logic as CNC machine time: hours × that machine's
    // own Credits field (cr/hour), added on top of the filament cost.
    let machineRate = 0;
    if (machineId && hours > 0) {
      const { data: machine, error: machErr } = await supabaseAdmin
        .from("inventory_items").select("unit_credit").eq("item_id", machineId).maybeSingle();
      if (machErr) throw machErr;
      machineRate = machine?.unit_credit ?? 0;
    }
    const credits = Math.round(grams * rate + hours * machineRate);

    const membership = await adjustCredits(studentId, -credits, {
      description: `3D printing ${grams}g ${filament?.name || ""}${hours > 0 ? ` + ${hours}h machine time` : ""} (walk-up)`.trim(),
    });

    if (filament) {
      const { error: stockErr } = await supabaseAdmin
        .from("filaments")
        .update({ stock_grams: Math.max(0, filament.stock_grams - grams), updated_at: new Date().toISOString() })
        .eq("filament_id", filament.filament_id);
      if (stockErr) throw stockErr;
    }

    await createPaidInvoice({
      userId: studentId, invoiceType: "3d_printing", totalCredit: credits,
      method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: studentId, type: "approved",
      message: `Your 3D print is ready: ${grams}g used, ${credits} cr charged.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// CNC / 3D-printer machine time: staff picks the machine and types in how
// long it ran once the job's done (no live timer), plus any material cost
// for whatever got consumed. Rate is that machine's own unit_credit — a
// Returnable item never has a real per-unit price, so this reuses the field
// as "credits per hour" instead, editable the same way any other item's
// Credits field already is from Manage Stock.
// credits = hours × hourly rate + material cost
export async function chargeMachineTimeNow(req, res, next) {
  try {
    const { studentId, itemId, hours, materialCost = 0 } = req.body;
    if (!studentId || !itemId || !hours || hours <= 0) {
      return res.status(400).json({ error: "studentId, itemId, and positive hours are required" });
    }

    const { data: machine, error: itemErr } = await supabaseAdmin
      .from("inventory_items").select("item_id, item_name, unit_credit").eq("item_id", itemId).maybeSingle();
    if (itemErr) throw itemErr;
    if (!machine) return res.status(404).json({ error: "Machine not found" });

    const rate = machine.unit_credit ?? 0;
    const credits = Math.round(hours * rate + (Number(materialCost) || 0));

    const membership = await adjustCredits(studentId, -credits, {
      description: `${machine.item_name} — ${hours}h${materialCost ? ` + ${materialCost} cr material` : ""} (walk-up)`,
    });

    await createPaidInvoice({
      userId: studentId, invoiceType: "machine_time", totalCredit: credits,
      method: "credit", verifiedBy: req.user.user_id,
    });
    await insertNotification({
      userId: studentId, type: "approved",
      message: `Machine time charged: ${machine.item_name}, ${hours}h, ${credits} cr.`,
    });

    res.json({ data: { credits: membership.credits } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// ── Counter sale (staff checkout) & self-serve purchase ──────────────────
// cart: [{ itemId, qty, action: 'purchase' | 'borrow' }]
export async function staffSale(req, res, next) {
  try {
    const { studentId, cart } = req.body;
    if (!studentId || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "studentId and a non-empty cart are required" });
    }

    const orderId = `ORD-${Date.now()}`;
    const purchaseLines = [];
    let creditsCharged = 0;
    const results = [];

    if (cart.length > 50) return res.status(400).json({ error: "Cart has too many lines" });
    for (const line of cart) {
      const qty = parseQuantity(line?.qty);
      if (qty === null) return res.status(400).json({ error: "qty must be a whole number from 1 to 1000" });
      const item = await changeStock(line.itemId, -qty);

      if (line.action === "purchase") {
        const { data: full, error } = await supabaseAdmin
          .from("inventory_items").select("unit_credit").eq("item_id", line.itemId).single();
        if (error) throw error;
        creditsCharged += full.unit_credit * qty;
        purchaseLines.push({ itemId: line.itemId, quantity: qty, unitPrice: full.unit_credit });
      } else {
        const { error: borrowErr } = await supabaseAdmin.from("borrow_transactions").insert({
          user_id: studentId, item_id: line.itemId, quantity_borrow: qty,
          due_date: line.dueDate || defaultDueDate(), approved_by: req.user.user_id,
          status: "borrowed", order_id: orderId, note: line.note || null,
        });
        if (borrowErr) throw borrowErr;
      }
      results.push({ itemId: line.itemId, name: item.item_name, action: line.action, qty });
    }

    let credits = null;
    if (purchaseLines.length) {
      const membership = await adjustCredits(studentId, -creditsCharged, {
        description: `Counter purchase ${orderId}`,
      });
      credits = membership.credits;
      await createPaidInvoice({
        userId: studentId, invoiceType: "item_purchase", totalCredit: creditsCharged,
        method: "credit", verifiedBy: req.user.user_id, lines: purchaseLines,
      });
    }

    res.status(201).json({ data: { orderId, credits, items: results } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// Self-serve consumable purchase from the student cart (own credits).
// cart: [{ itemId, qty }]
export async function selfPurchase(req, res, next) {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "A non-empty cart is required" });
    }

    const lines = [];
    let total = 0;
    if (cart.length > 50) return res.status(400).json({ error: "Cart has too many lines" });
    for (const line of cart) {
      const qty = parseQuantity(line?.qty);
      if (qty === null) return res.status(400).json({ error: "qty must be a whole number from 1 to 1000" });
      const { data: item, error } = await supabaseAdmin
        .from("inventory_items").select("item_id, item_name, unit_credit, current_stock, is_returnable")
        .eq("item_id", line.itemId).single();
      if (error) throw error;
      if (item.is_returnable) return res.status(400).json({ error: `"${item.item_name}" is returnable; request to borrow it instead` });
      if (item.current_stock < qty) return res.status(400).json({ error: `Not enough stock of "${item.item_name}"` });
      total += item.unit_credit * qty;
      lines.push({ itemId: item.item_id, quantity: qty, unitPrice: item.unit_credit });
    }

    const membership = await adjustCredits(req.user.user_id, -total, {
      description: "Self-serve item purchase",
    });
    for (const l of lines) await changeStock(l.itemId, -l.quantity);
    await createPaidInvoice({
      userId: req.user.user_id, invoiceType: "item_purchase", totalCredit: total,
      method: "credit", verifiedBy: null, lines,
    });

    res.status(201).json({ data: { credits: membership.credits, charged: total } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// type: 'topup' charges at CREDIT_RATE/$1 (requires existing membership);
// 'membership' is the fixed $20/year plan: activates/renews + bonus credits.
export async function topUpCounter(req, res, next) {
  try {
    const { studentId, amountUSD, method = "cash", type = "topup" } = req.body;
    if (!studentId || !amountUSD || amountUSD <= 0) return res.status(400).json({ error: "studentId and positive amountUSD are required" });
    if (type === "membership" && amountUSD !== MEMBERSHIP_PLAN.price) {
      return res.status(400).json({ error: `Membership is a fixed $${MEMBERSHIP_PLAN.price}.` });
    }

    if (type === "membership") {
      // Activate/renew first so the credits grant always has a row to land on.
      const existing = await getMembershipByUserId(studentId);
      const start = new Date();
      const expired = new Date(start);
      expired.setFullYear(expired.getFullYear() + 1);
      const payload = {
        user_id: studentId, membership_status: "active",
        start_date: start.toISOString().slice(0, 10), expired_date: expired.toISOString().slice(0, 10),
        approved_by: req.user.user_id,
      };
      const { error } = existing
        ? await supabaseAdmin.from("memberships").update(payload).eq("membership_id", existing.membership_id)
        : await supabaseAdmin.from("memberships").insert({ ...payload, credits: 0 });
      if (error) throw error;
    }

    const creditsToAdd = type === "membership" ? MEMBERSHIP_PLAN.bonusCredits : Math.round(amountUSD * CREDIT_RATE);
    const membership = await adjustCredits(studentId, creditsToAdd, {
      sourceType: "membership",
      description: type === "membership" ? "Membership activation bonus" : `Credit top-up $${amountUSD}`,
    });

    await createPaidInvoice({
      userId: studentId, invoiceType: type === "membership" ? "membership" : "credit_topup",
      totalAmount: amountUSD, method, verifiedBy: req.user.user_id,
    });

    res.json({ data: { credits: membership.credits, membershipStatus: membership.membership_status } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// ── Item image upload ────────────────────────────────────────────────────
// Multipart file (field "image") → Supabase Storage 'item-images' bucket →
// returns the public URL; the client then saves it on the item as image_url.
export async function uploadItemImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided (field name: image)" });
    const ext = (req.file.originalname.match(/\.\w+$/) || [".jpg"])[0].toLowerCase();
    const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("item-images")
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) throw upErr;

    const { data } = supabaseAdmin.storage.from("item-images").getPublicUrl(path);
    res.status(201).json({ data: { url: data.publicUrl } });
  } catch (err) {
    next(err);
  }
}

// ── Maintenance ──────────────────────────────────────────────────────────

// One open (unresolved) log per item. Manage Stock shows this as the
// "Reported Issue" on any item currently flagged unavailable/Maintenance.
export async function listOpenMaintenance(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("maintenance_logs")
      .select("item_id, notes, quantity_damaged, reported_at")
      .is("resolved_at", null)
      .order("reported_at", { ascending: false });
    if (error) throw error;
    const byItem = {};
    for (const log of data) if (!(log.item_id in byItem)) byItem[log.item_id] = log;
    res.json({ data: Object.values(byItem) });
  } catch (err) { next(err); }
}

// Reporting an issue on N units pulls exactly those N out of current_stock
// (same "hold back only what's actually broken" rule the return flow
// uses) — the rest of the item's stock stays borrowable, no item-wide
// status flip.
export async function reportMaintenance(req, res, next) {
  try {
    const { notes, quantityDamaged = 1 } = req.body;
    const { error: logErr } = await supabaseAdmin.from("maintenance_logs").insert({
      item_id: req.params.id, reported_by: req.user.user_id,
      quantity_damaged: quantityDamaged, notes: notes || null,
    });
    if (logErr) throw logErr;
    await changeStock(req.params.id, -quantityDamaged);
    res.status(201).json({ data: { reported: true } });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// Mirrors reportMaintenance: resolving the open log(s) hands that same
// quantity back to current_stock — this was the missing half of the fix,
// stock was never coming back after a repair.
export async function completeMaintenance(req, res, next) {
  try {
    const { data: openLogs, error: readErr } = await supabaseAdmin
      .from("maintenance_logs").select("maintenance_id, quantity_damaged")
      .eq("item_id", req.params.id).is("resolved_at", null)
      .order("reported_at", { ascending: false });
    if (readErr) throw readErr;

    if (openLogs.length) {
      const { error: resolveErr } = await supabaseAdmin
        .from("maintenance_logs")
        .update({ resolved_at: new Date().toISOString(), resolved_by: req.user.user_id })
        .in("maintenance_id", openLogs.map((l) => l.maintenance_id));
      if (resolveErr) throw resolveErr;

      const repairedQty = openLogs.reduce((sum, l) => sum + (l.quantity_damaged || 1), 0);
      await changeStock(req.params.id, repairedQty);
    }

    const { data, error } = await supabaseAdmin
      .from("inventory_items").select("*").eq("item_id", req.params.id).single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    if (creditsErrorToResponse(err, res)) return;
    next(err);
  }
}

// ── Notifications ────────────────────────────────────────────────────────

// Generated lazily whenever a student's notifications are fetched; no cron
// needed, and the UNIQUE (user_id, dedup_key) constraint makes re-runs safe.
export async function generateDueDateAlerts(userId) {
  const { data: borrows, error } = await supabaseAdmin
    .from("borrow_transactions").select("borrow_id, due_date, inventory_items(item_name)")
    .eq("user_id", userId).eq("status", "borrowed").not("due_date", "is", null);
  if (error) throw error;
  if (!borrows.length) return;

  const now = new Date();
  const candidates = [];
  for (const b of borrows) {
    const dueDay = (b.due_date || "").slice(0, 10);
    const daysLeft = Math.ceil((new Date(b.due_date) - now) / 86400000);
    const itemName = b.inventory_items?.item_name || "an item";
    if (daysLeft < 0) {
      candidates.push({
        user_id: userId, notification_type: "overdue", is_read: false, dedup_key: `overdue-${b.borrow_id}`,
        message: `"${itemName}" is overdue (due ${dueDay}). Late returns are charged ${OVERDUE_RATE} credits per day. Please return it as soon as possible.`,
      });
    } else if (daysLeft <= 1) {
      candidates.push({
        user_id: userId, notification_type: "request", is_read: false, dedup_key: `due-${b.borrow_id}`,
        message: `Reminder: "${itemName}" is due ${daysLeft === 0 ? "today" : "tomorrow"} (${dueDay}). Late returns are charged ${OVERDUE_RATE} credits per day.`,
      });
    }
  }
  if (!candidates.length) return;

  const { error: insErr } = await supabaseAdmin
    .from("notifications")
    .upsert(candidates, { onConflict: "user_id,dedup_key", ignoreDuplicates: true });
  if (insErr) throw insErr;
}

export async function listNotifications(req, res, next) {
  try {
    await generateDueDateAlerts(req.user.user_id);
    const { data, error } = await supabaseAdmin
      .from("notifications").select("*").eq("user_id", req.user.user_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data.map(normalizeRow) });
  } catch (err) { next(err); }
}

export async function markNotificationRead(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("notifications").update({ is_read: true })
      .eq("notification_id", req.params.id).eq("user_id", req.user.user_id)
      .select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const { error } = await supabaseAdmin
      .from("notifications").update({ is_read: true })
      .eq("user_id", req.user.user_id).eq("is_read", false);
    if (error) throw error;
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
}
