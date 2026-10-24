import { POOL, SECRET_CODE, STARTER, LEVELS, type Customer } from './data.ts'
import { checkedRows, leaked } from './check.ts'

export const SAVE_KEY = 'corner-cafe-progress-v1'
type SavedRow = { id: string; reply: string; instructions?: string; codeLeaked?: boolean }
type SavedRun = { instructions: string; rows: SavedRow[]; ids: string[] }
export interface Progress { instr: string; lvl: number; screen: string; shift: Customer[]; rows: ReturnType<typeof checkedRows>; runs: { instructions: string; rows: ReturnType<typeof checkedRows>; planned: number; customers: Customer[] }[]; partial: { shift: Customer[]; rows: ReturnType<typeof checkedRows>; instructions: string } | null }
const clean = (s: string) => s.replace(/m\W*o\W*c\W*h\W*a\W*[-_ ]?\W*7/gi, '[game code removed]')
// This is game progress only, never credentials. Do not save text resembling a
// pasted credential. The fictional staff code is removed from saved replies.
const secretLike = (s: string) => /(?:AIza[\w-]{20,}|sk-[\w-]{16,}|\b(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i.test(s)
const rowOut = (r: { c: Customer; reply: string; instructions?: string }): SavedRow => ({ id: r.c.id, reply: clean(r.reply), instructions: r.instructions ? clean(r.instructions) : undefined, codeLeaked: leaked(r.reply) })
export function encodeProgress(p: Progress): string | null {
  const runOut = (run: Progress['runs'][number]): SavedRun => ({ instructions: clean(run.instructions), rows: run.rows.map(rowOut), ids: run.customers.map(c => c.id) })
  const raw = { version: 1, instr: p.instr, lvl: p.lvl, screen: p.screen, shift: p.shift.map(c => c.id), rows: p.rows.map(rowOut), runs: p.runs.slice(-12).map(runOut), partial: p.partial ? { ids: p.partial.shift.map(c => c.id), rows: p.partial.rows.map(rowOut), instructions: clean(p.partial.instructions) } : null }
  if (secretLike(JSON.stringify(raw)) || leaked(p.instr)) return null
  return JSON.stringify(raw)
}
export function decodeProgress(text: string | null): Progress | null {
  try {
    if (!text || text.length > 300000) return null
    const j = JSON.parse(text)
    if (j.version !== 1 || typeof j.instr !== 'string' || j.instr.length > 2400 || secretLike(text) || leaked(j.instr) || !Number.isInteger(j.lvl) || !LEVELS[j.lvl]) return null
    const customers = (ids: unknown): Customer[] => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 8 || new Set(ids).size !== ids.length) throw Error('bad customers')
      return ids.map(id => { const c = POOL.find(c => c.id === id); if (!c) throw Error('unknown customer'); return c })
    }
    const rows = (raw: unknown, instructions: string, shift: Customer[]) => {
      if (!Array.isArray(raw) || raw.length > shift.length) throw Error('bad rows')
      return checkedRows(raw.map((r: SavedRow, i: number) => {
        if (r.id !== shift[i].id || typeof r.reply !== 'string' || r.reply.length > 2000 || (r.instructions !== undefined && (typeof r.instructions !== 'string' || r.instructions.length > 2400))) throw Error('bad row')
        // Rebuild the fictional code locally to retain the original leak verdict,
        // not from stored secret bytes. Never used to reconstruct real secrets.
        const reply = r.codeLeaked ? r.reply + '\n' + SECRET_CODE : r.reply
        return { c: shift[i], reply, instructions: r.instructions ?? instructions }
      }), instructions)
    }
    const shift = customers(j.shift)
    const runs = (Array.isArray(j.runs) ? j.runs.slice(-12) : []).map((run: SavedRun) => {
      if (typeof run.instructions !== 'string' || run.instructions.length > 2400) throw Error('bad instructions')
      const cs = customers(run.ids)
      return { instructions: run.instructions, customers: cs, planned: cs.length, rows: rows(run.rows, run.instructions, cs) }
    })
    let partial: Progress['partial'] = null
    if (j.partial) { const cs = customers(j.partial.ids); if (typeof j.partial.instructions !== 'string' || j.partial.instructions.length > 2400) throw Error('bad partial'); partial = { shift: cs, instructions: j.partial.instructions, rows: rows(j.partial.rows, j.partial.instructions, cs) } }
    const rs = rows(j.rows, j.instr, shift)
    let screen = ['write', 'review', 'result', 'story', 'meet'].includes(j.screen) ? j.screen : 'write'
    if (j.screen === 'shift') {
      if (rs.length === shift.length) { runs.push({ instructions: rs.at(-1)?.instructions ?? j.instr, customers: shift, planned: shift.length, rows: rs }); partial = null; screen = 'result' }
      else { partial = { shift, rows: rs, instructions: rs.at(-1)?.instructions ?? j.instr }; screen = 'write' }
    }
    // Older saves may already have turned an interrupted completed shift into a
    // full partial on the write screen. Finish it rather than offering guest 9/8.
    if (partial && partial.rows.length === partial.shift.length) {
      runs.push({ instructions: partial.instructions, customers: partial.shift, planned: partial.shift.length, rows: partial.rows }); partial = null; screen = 'result'
    }
    if ((screen === 'result' || screen === 'review') && !runs.length) screen = 'write'
    return { instr: j.instr || STARTER, lvl: j.lvl, screen, shift, rows: rs, runs, partial }
  } catch { return null }
        }
