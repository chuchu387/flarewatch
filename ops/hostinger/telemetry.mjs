import http from 'node:http';
import fs from 'node:fs/promises';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 5097);
const reportFile = '/var/lib/codastra-monitor/latest.json';
const maxAgeMs = 10 * 60 * 1000;

const categories = {
  overall: () => true,
  resources: (key) => key.startsWith('resource.'),
  infrastructure: (key) => key.startsWith('service.'),
  integrations: (key) => key.startsWith('integration.'),
  ssl: (key) => key.startsWith('ssl.'),
};

const send = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(payload);
};

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, { status: 'error', message: 'Method not allowed' });
    return;
  }

  const category =
    new URL(request.url, `http://${host}:${port}`).pathname.replace(/^\/health\/?/, '') || 'agent';
  if (category === 'agent') {
    send(response, 200, { status: 'healthy', service: 'CodAstra telemetry agent' });
    return;
  }
  if (!(category in categories)) {
    send(response, 404, { status: 'error', message: 'Not found' });
    return;
  }

  try {
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    const checkedAt = Date.parse(report.checkedAt);
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > maxAgeMs) {
      send(response, 503, { status: 'stale', checkedAt: report.checkedAt || null });
      return;
    }

    const failures = Object.entries(report.failures || {})
      .filter(([key]) => categories[category](key))
      .map(([key]) => key);
    send(response, failures.length === 0 ? 200 : 503, {
      status: failures.length === 0 ? 'healthy' : 'unhealthy',
      checkedAt: report.checkedAt,
      failureCount: failures.length,
      failures,
    });
  } catch {
    send(response, 503, { status: 'unavailable' });
  }
});

server.listen(port, host, () => {
  console.log(`CodAstra telemetry agent listening on http://${host}:${port}`);
});
