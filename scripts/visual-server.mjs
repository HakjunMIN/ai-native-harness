import { createServer } from 'node:http';
import { readFile, realpath, stat, writeFile, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export async function startVisualServer(directory, port = 0) {
  const root = await realpath(directory);
  const options = JSON.parse(await readFile(resolve(root,'options.json'),'utf8'));
  if (!Array.isArray(options) || !options.length || options.some(x => typeof x !== 'string' || !/^[a-z0-9-]+$/.test(x))) throw new Error('options.json must contain option identifiers');
  const server = createServer(async (req, res) => {
    const reply = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'"});
      res.end(body);
    };
    const expected = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== expected || (req.headers.origin && req.headers.origin !== `http://${expected}`)) return reply(403,'Loopback origin required');
    try {
      const path = decodeURIComponent(req.url.split('?')[0]);
      if (path === '/selection' && req.method === 'POST') {
        if (req.headers.origin !== `http://${expected}`) return reply(403,'Origin required');
        if (!req.headers['content-type']?.startsWith('application/json')) return reply(415,'JSON required');
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) return reply(413,'Selection too large');
        }
        let selected;
        try { selected = JSON.parse(body); } catch { return reply(400,'Invalid JSON'); }
        if (!options.includes(selected.option)) return reply(400,'Unknown option');
        const temp = resolve(root,`.selection-${randomUUID()}.tmp`);
        const data = {option:selected.option, at:new Date().toISOString(), approved:false};
        await writeFile(temp, `${JSON.stringify(data,null,2)}\n`, {flag:'wx'});
        await rename(temp,resolve(root,'selection.json'));
        return reply(200,JSON.stringify(data),'application/json');
      }
      if (req.method !== 'GET') return reply(405,'GET or selection POST required');
      if (path.includes('\0') || path.split(/[\\/]/).includes('..')) return reply(403,'Invalid path');
      const target = await realpath(resolve(root,`.${path === '/' ? '/index.html' : path}`));
      const rel = relative(root,target);
      if (rel.startsWith('..') || isAbsolute(rel)) return reply(403,'Outside prototype');
      if (!(await stat(target)).isFile()) return reply(404,'Not a file');
      const types = {'.html':'text/html; charset=utf-8','.json':'application/json','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
      if (!types[extname(target)]) return reply(403,'Unsupported prototype asset');
      reply(200,await readFile(target),types[extname(target)]);
    } catch (error) {
      if (error.code === 'ENOENT') return reply(404,'Not found');
      if (error instanceof URIError) return reply(400,'Malformed URL');
      console.error(`Visual server request failed: ${error.message}`);
      reply(500,'Unable to serve prototype');
    }
  });
  await new Promise((ok, fail) => { server.once('error',fail); server.listen(port,'127.0.0.1',ok); });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [dir,port = '0'] = process.argv.slice(2);
    if (!dir || !/^\d+$/.test(port) || Number(port) > 65535) throw new Error('Usage: visual-server.mjs PROTOTYPE_DIR [PORT]');
    const server = await startVisualServer(dir,Number(port));
    console.log(`http://127.0.0.1:${server.address().port}`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
