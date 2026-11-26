import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDashboardServer } from './dashboard/server.mjs';

function parsePort(args) {
  if (args.length === 0) return 0;
  if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1])) {
    throw new Error('Usage: dashboard.mjs [--port <0..65535>]');
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Port must be an integer from 0 to 65535');
  }
  return port;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = parsePort(process.argv.slice(2));
    const server = await startDashboardServer({ port });
    // Handlers must be in place before the URL announces readiness, or an early signal kills the process.
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        server.close(error => {
          if (error) {
            console.error(`Unable to close dashboard server: ${error.message}`);
            process.exitCode = 1;
          }
        });
      });
    }
    console.log(`http://127.0.0.1:${server.address().port}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
