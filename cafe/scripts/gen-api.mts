// Rebuilds the generated parts of the server routes from cafe/src/cafe/data.ts. `--check` only compares (used by tests).
import { readFileSync, writeFileSync } from 'node:fs'
import { POOL } from '../src/cafe/data.ts'
const root = new URL('../../', import.meta.url)
const rd = (p: string) => readFileSync(new URL(p, root), 'utf8')
const data = rd('cafe/src/cafe/data.ts')
const reply = rd('api/cafe-reply.ts')
const handler = reply.slice(reply.indexOf("// Server route: the game's hosted model call."))
const wantReply = reply.split('\n')[0] + '\n' + data + (data.endsWith('\n') ? '' : '\n') + handler
const coach = rd('api/cafe-coach.ts')
const known = 'const KNOWN: Record<string, string> = {\n' + POOL.map((c) => `  ${c.id}: ${JSON.stringify(c.line)},`).join('\n') + '\n}\n'
const wantCoach = coach.replace(/(\/\/ BEGIN KNOWN[^\n]*\n)[\s\S]*(\/\/ END KNOWN)/, (_m, a, b) => a + known + b)
if (process.argv.includes('--check')) {
  const ok = wantReply === reply && wantCoach === coach
  console.log(ok ? 'api in sync' : 'api OUT OF SYNC: run node --experimental-strip-types scripts/gen-api.mts')
  process.exit(ok ? 0 : 1)
}
writeFileSync(new URL('api/cafe-reply.ts', root), wantReply)
writeFileSync(new URL('api/cafe-coach.ts', root), wantCoach)
console.log('written', POOL.length, 'customers')
