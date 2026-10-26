/**
 * A crag's name and score carried between its list row and its own screen
 * (owner, 2026-10-21, the motion mockup): both ends mark the two with
 * `CRAG_FLY_ATTR`, and for the length of one view transition the pair on
 * screen takes a `view-transition-name`, which the browser morphs from one
 * place to the other (`globals.css`).
 *
 * A name may be on one element at a time, or the browser drops the whole
 * transition, so it is set only on the visible pair for the one crag, and only
 * while a transition runs. The list's rows carry `CRAG_FLY_ID_ATTR` to say
 * which crag; a crag's own screen shows one crag and needs none.
 */
export const CRAG_FLY_ATTR = 'data-crag-fly'
export const CRAG_FLY_ID_ATTR = 'data-crag-fly-id'

const PARTS = ['name', 'score'] as const

/** The crag a change between `from` and `to` opens or leaves, from whichever is its screen. */
export function cragFlyId(from: string, to: string): string | null {
  const id = (path: string) => /^\/location\/([^/]+)\/?$/.exec(path)?.[1] ?? null
  return id(to) ?? id(from)
}

let flying: string | null = null

/** The crag whose name and score are in flight, for a row that receives them to stay put. */
export function flyingCragId(): string | null {
  return flying
}

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
}

/** Names the visible pair for `id`, after clearing any pair named before. */
export function nameCragFly(id: string): void {
  flying = id
  clearCragFly()
  for (const part of PARTS) {
    const el = [...document.querySelectorAll<HTMLElement>(`[${CRAG_FLY_ATTR}="${part}"]`)].find((e) => {
      const of = e.getAttribute(CRAG_FLY_ID_ATTR)
      return (of === null || of === id) && onScreen(e)
    })
    if (el !== undefined) el.style.viewTransitionName = `wt6-crag-${part}`
  }
}

export function clearCragFly(): void {
  document.querySelectorAll<HTMLElement>(`[${CRAG_FLY_ATTR}]`).forEach((e) => {
    e.style.viewTransitionName = ''
  })
}

export function endCragFly(): void {
  clearCragFly()
  flying = null
}
