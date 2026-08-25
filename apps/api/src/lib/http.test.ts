import { describe, it, expect } from 'vitest'
import { describeError, isUuid } from './http.js'

describe('isUuid', () => {
  it('accepts a well-formed uuid in either case', () => {
    expect(isUuid('0881e456-8b55-4cdf-ab00-607a82409fdc')).toBe(true)
    expect(isUuid('0881E456-8B55-4CDF-AB00-607A82409FDC')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('0881e456-8b55-4cdf-ab00')).toBe(false)
    expect(isUuid("0881e456-8b55-4cdf-ab00-607a82409fdc' OR 1=1")).toBe(false)
  })
})

describe('describeError', () => {
  it('reads the message off an Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('reads the message off a plain object — the case String() ruined', () => {
    // Postgres drivers reject with objects, not Error instances. Before this,
    // every such failure logged "[object Object]".
    expect(describeError({ message: 'connection refused' })).toContain('connection refused')
    expect(describeError({ message: 'x' })).not.toContain('[object Object]')
  })

  it('appends driver diagnostics when present', () => {
    const described = describeError({
      message: 'connect ECONNREFUSED',
      code: 'ECONNREFUSED',
      errno: -4078,
      syscall: 'connect',
    })
    expect(described).toContain('connect ECONNREFUSED')
    expect(described).toContain('code=ECONNREFUSED')
    expect(described).toContain('errno=-4078')
    expect(described).toContain('syscall=connect')
  })

  it('unwraps an aggregate error', () => {
    const described = describeError({
      message: 'all attempts failed',
      errors: [new Error('attempt one'), { message: 'attempt two' }],
    })
    expect(described).toContain('attempt one')
    expect(described).toContain('attempt two')
  })

  it('caps the number of nested errors it reports', () => {
    const described = describeError({
      errors: [{ message: 'a' }, { message: 'b' }, { message: 'c' }, { message: 'd' }],
    })
    expect(described).toContain('a')
    expect(described).not.toContain('d')
  })

  it('follows a cause chain', () => {
    const described = describeError(new Error('outer', { cause: new Error('inner') }))
    expect(described).toContain('outer')
    expect(described).toContain('inner')
  })

  it('terminates on a self-referencing cause', () => {
    const cyclic: { message: string; cause?: unknown } = { message: 'loop' }
    cyclic.cause = cyclic
    expect(() => describeError(cyclic)).not.toThrow()
    expect(describeError(cyclic)).toContain('loop')
  })

  it('never serialises an unrecognised object wholesale', () => {
    // A driver error can hold the client config, connection string included.
    // Naming the keys is safe; dumping the values is not.
    const described = describeError({ connectionString: 'postgres://user:hunter2@host/db' })
    expect(described).not.toContain('hunter2')
    expect(described).toContain('connectionString')
  })

  it('names the class of an unrecognised non-plain object', () => {
    class WeirdFailure {}
    expect(describeError(new WeirdFailure())).toBe('unrecognised error of type WeirdFailure')
  })

  it('handles strings, null, and undefined', () => {
    expect(describeError('plain string')).toBe('plain string')
    expect(describeError(null)).toBe('null')
    expect(describeError(undefined)).toBe('undefined')
    expect(describeError(42)).toBe('42')
  })
})
