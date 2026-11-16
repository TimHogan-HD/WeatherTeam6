import { describe, expect, it } from 'vitest'
import { afterTransition } from './useNavigate.js'

/** Lets every settled promise's handlers run. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('afterTransition', () => {
  it('cleans up after a transition that finished', async () => {
    let cleaned = 0
    afterTransition(Promise.resolve(), () => cleaned++)
    await flush()
    expect(cleaned).toBe(1)
  })

  // Vitest fails the run on an unhandled rejection, so a rejection passed on
  // (as `.finally` does) fails this test even though the cleanup ran.
  it('cleans up after a transition the browser aborted, and swallows the rejection', async () => {
    let cleaned = 0
    const aborted = Promise.reject(new DOMException('Transition was aborted because of timeout in DOM update', 'TimeoutError'))
    afterTransition(aborted, () => cleaned++)
    await flush()
    expect(cleaned).toBe(1)
  })
})
