// Quantities come straight from the request body. A negative, fractional,
// or string quantity turns a "spend" into an "earn" (credits = price * qty),
// so every quantity is checked here before any credit or stock math.
export const MAX_QTY = 1000;

export function parseQuantity(value, { fallback = 1 } = {}) {
  const qty = value === undefined || value === null || value === "" ? fallback : value;
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY ? qty : null;
}
