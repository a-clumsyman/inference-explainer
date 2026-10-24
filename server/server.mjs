// Corner Café on a plain Node host (Render): static SPA + the two /api handlers.
// Zero dependencies. The handlers are the same Vercel-style modules, esbuild-bundled at build time.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import replyHandler from './dist/cafe-reply.js'
import coachHandler from './dist/cafe-coach.js'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(ROOT, '..', 'cafe', 'dist')
const PORT = Number(process.env.PORT || 3000)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' }

/** Adapt node:http req/res to the small Vercel-shaped surface the handlers use. */
function wrap(handler) {
  return async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    let body = {}
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { body = {} }
    const vreq = { method: req.method, headers: req.headers, body }
    const vres = {
      statusCode: 200,
      setHeader: (k, v) => res.setHeader(k, v),
      status(code) { this.statusCode = code; return this },
      json(obj) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) },
      end() { res.writeHead(this.statusCode); res.end() },
    }
    try { await handler(vreq, vres) } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'server error' }))
      console.error(e)
    }
  }
}

const routes = { '/api/cafe-reply': wrap(replyHandler), '/api/cafe-coach': wrap(coachHandler) }

createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x')
  const route = routes[url.pathname]
  if (route) return route(req, res)
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, path)
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  let data
  try { data = await readFile(file) } catch {
    try { data = await readFile(join(DIST, 'index.html')); res.setHeader('Content-Type', MIME['.html']) } catch { res.writeHead(404); return res.end('not found') }
    res.writeHead(200); return res.end(data)
  }
  res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream')
  res.writeHead(200)
  res.end(data)
}).listen(PORT, () => console.log(`corner-cafe listening on :${PORT}`))
