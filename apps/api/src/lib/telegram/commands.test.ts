import { describe, expect, it } from 'vitest'
import { BOT_COMMANDS, formatHelp, parseCommand } from './commands.js'

describe('parseCommand', () => {
  it('parses a bare command', () => {
    expect(parseCommand('/start')).toEqual({ name: 'start', botName: null, args: '' })
  })

  it('lowercases the name — Telegram treats /Start and /start as one command', () => {
    expect(parseCommand('/START')?.name).toBe('start')
  })

  it('takes everything after the first space as the argument, inner spacing intact', () => {
    expect(parseCommand('/conditions   red   rock  ')).toEqual({
      name: 'conditions',
      botName: null,
      args: 'red   rock',
    })
  })

  it('accepts the @botname suffix clients append', () => {
    expect(parseCommand('/conditions@WeatherTeam6_bot red rock')).toEqual({
      name: 'conditions',
      botName: 'WeatherTeam6_bot',
      args: 'red rock',
    })
  })

  it('does NOT read /conditionsfoo as /conditions', () => {
    // The regression this module exists for. `startsWith('/conditions')` matched
    // this, so a future /conditionshistory would have been swallowed by the old
    // command with no error anywhere. The name must come back whole.
    expect(parseCommand('/conditionsfoo')?.name).toBe('conditionsfoo')
  })

  it('does not match a command mentioned inside a sentence', () => {
    // Anchoring. Unanchored, "ask me with /start" would fire /start.
    expect(parseCommand('ask me with /start')).toBeNull()
  })

  it('returns null for ordinary chat text and for a bare slash', () => {
    expect(parseCommand('hello')).toBeNull()
    expect(parseCommand('')).toBeNull()
    expect(parseCommand('/')).toBeNull()
  })

  it('refuses a name past Telegram’s 32-character limit rather than truncating it', () => {
    expect(parseCommand(`/${'a'.repeat(32)}`)?.name).toBe('a'.repeat(32))
    expect(parseCommand(`/${'a'.repeat(33)}`)).toBeNull()
  })

  it('tolerates surrounding whitespace, which mobile keyboards add', () => {
    expect(parseCommand('  /help  ')?.name).toBe('help')
  })
})

describe('BOT_COMMANDS', () => {
  it('satisfies what setMyCommands accepts', () => {
    // Telegram rejects the whole registration with a 400 if any entry breaks
    // these, and the script that registers them mutates the live bot — so the
    // constraint is checked here rather than discovered there.
    expect(BOT_COMMANDS.length).toBeGreaterThan(0)
    for (const c of BOT_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/)
      expect(c.description.length).toBeGreaterThan(0)
      expect(c.description.length).toBeLessThanOrEqual(256)
    }
  })

  it('carries no angle brackets — the exact thing that killed /start', () => {
    // `/start` replied with a literal `<location name>` under parse_mode HTML
    // and had never once worked. formatHelp escapes anyway; not needing the
    // escape is the belt to that braces.
    for (const c of BOT_COMMANDS) {
      expect(c.description).not.toMatch(/[<>]/)
    }
  })
})

describe('formatHelp', () => {
  it('lists every registered command, so the two cannot drift', () => {
    const help = formatHelp()
    for (const c of BOT_COMMANDS) expect(help).toContain(`/${c.command}`)
  })

  it('leaves no unescaped angle bracket outside its own markup', () => {
    // Strip the tags this function itself emits; anything left must be escaped.
    const body = formatHelp().replace(/<\/?b>/g, '')
    expect(body).not.toMatch(/[<>]/)
  })
})
