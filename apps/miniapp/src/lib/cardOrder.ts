/**
 * The order of a crag tab's cards, chosen by the reader and remembered on this
 * device (owner, 2026-11-03). One order per tab, for every crag: a card moved on
 * Hourly stays moved at the next crag.
 *
 * What is saved may hold cards this screen is not showing (a card only some
 * crags have), and may lack cards that did not exist when it was saved. Neither
 * is an error: `arrange` keeps the ids it was given and nothing else, and
 * `moveCard` keeps an absent card's place for the crag that has it.
 */
export type CardTab = 'overview' | 'hourly' | 'precip' | 'rock'

export type CardMove = -1 | 1

const STORAGE_KEY = 'wt6.cardOrder'

/** Storage can throw or come back holding anything (`authToken.ts`); either reads as nothing saved. */
function readOrders(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string[]> = {}
    for (const [tab, order] of Object.entries(parsed)) {
      if (Array.isArray(order)) out[tab] = order.filter((id): id is string => typeof id === 'string')
    }
    return out
  } catch {
    return {}
  }
}

export function savedOrder(tab: CardTab): string[] {
  return readOrders()[tab] ?? []
}

/** An empty order returns the tab to the app's own. */
export function saveOrder(tab: CardTab, order: readonly string[]): void {
  const orders = readOrders()
  if (order.length === 0) delete orders[tab]
  else orders[tab] = [...order]
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
  } catch {
    // Unavailable storage costs only the order on the next open.
  }
}

/**
 * `ids`, the cards on screen in the app's own order, as the reader arranged
 * them. A card the saved order has never seen takes its place after the card it
 * follows in the app's order, so a new chart lands beside its neighbour rather
 * than at the bottom of a tab.
 */
export function arrange(saved: readonly string[], ids: readonly string[]): string[] {
  const known = new Set(ids)
  const out = [...new Set(saved)].filter((id) => known.has(id))
  ids.forEach((id, i) => {
    if (out.includes(id)) return
    const before = ids[i - 1]
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, id)
  })
  return out
}

/**
 * The order to save after moving `id` one place among the cards on screen, or
 * `null` when it cannot move: it is already at that end, or is not on screen.
 * Each slot a card on screen held is refilled in the new order, so a card
 * absent here stays where it was.
 */
export function moveCard(saved: readonly string[], ids: readonly string[], id: string, by: CardMove): string[] | null {
  const shown = arrange(saved, ids)
  const from = shown.indexOf(id)
  const neighbour = shown[from + by]
  if (from === -1 || neighbour === undefined) return null
  shown[from] = neighbour
  shown[from + by] = id

  const onScreen = new Set(ids)
  const queue = [...shown]
  const out = [...new Set(saved)].map((s) => (onScreen.has(s) ? (queue.shift() ?? s) : s))
  return [...out, ...queue]
}
