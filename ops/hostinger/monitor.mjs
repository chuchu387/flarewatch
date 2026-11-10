import fs from 'node:fs/promises';
import os from 'node:os';
import tls from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const stateDir = '/var/lib/codastra-monitor';
const stateFile = `${stateDir}/state.json`;
const latestFile = `${stateDir}/latest.json`;

const endpoints = [
  { key: 'platterlabs', name: 'PlatterLabs', url: 'https://api.platterslabs.com/api/keep-alive' },
  { key: 'bridgelabs', name: 'BridgeLabs', url: 'https://api.bridgeelabs.com/api/health' },
  {
    key: 'astrafreight',
    name: 'AstraFreight',
    url: 'https://api.astrafreight.codastralabs.com/api/v1/health',
  },
  { key: 'classora', name: 'Classora', url: 'https://api.codastralabs.com/classora/health' },
  { key: 'attendora', name: 'Attendora', url: 'https://api.codastralabs.com/attendora/api/health' },
];

const services = [
  'nginx',
  'platterlabs-backend',
  'pm2-codastra',
  'fail2ban',
  'certbot.timer',
  'flarewatch-proxy',
];
const pm2Processes = [
  'codastra-backend-hostinger',
  'astrafreight-backend',
  'classora-backend',
  'attendora-api',
];

const thresholds = {
  cpu: Number(process.env.MONITOR_CPU_WARN_PERCENT || 90),
  memory: Number(process.env.MONITOR_MEMORY_WARN_PERCENT || 85),
  swap: Number(process.env.MONITOR_SWAP_WARN_PERCENT || 60),
  disk: Number(process.env.MONITOR_DISK_WARN_PERCENT || 80),
  sslDays: Number(process.env.MONITOR_SSL_WARN_DAYS || 21),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const readCpu = async () => {
  const sample = async () => {
    const line = (await fs.readFile('/proc/stat', 'utf8'))
      .split('\n')[0]
      .trim()
      .split(/\s+/)
      .slice(1)
      .map(Number);
    return { idle: line[3] + line[4], total: line.reduce((sum, value) => sum + value, 0) };
  };
  const before = await sample();
  await sleep(1000);
  const after = await sample();
  const total = after.total - before.total;
  return round(total > 0 ? ((total - (after.idle - before.idle)) / total) * 100 : 0);
};

const readMemory = async () => {
  const values = Object.fromEntries(
    (await fs.readFile('/proc/meminfo', 'utf8'))
      .trim()
      .split('\n')
      .map((line) => {
        const [key, value] = line.split(':');
        return [key, Number(value.trim().split(/\s+/)[0])];
      }),
  );
  const memoryPercent = ((values.MemTotal - values.MemAvailable) / values.MemTotal) * 100;
  const swapPercent =
    values.SwapTotal > 0 ? ((values.SwapTotal - values.SwapFree) / values.SwapTotal) * 100 : 0;
  return {
    memoryPercent: round(memoryPercent),
    swapPercent: round(swapPercent),
    memoryTotalMb: round(values.MemTotal / 1024),
    swapTotalMb: round(values.SwapTotal / 1024),
  };
};

const readDisk = async () => {
  const { stdout } = await execFileAsync('df', ['-P', '/']);
  const columns = stdout.trim().split('\n').at(-1).split(/\s+/);
  return {
    percent: Number(columns[4].replace('%', '')),
    availableMb: round(Number(columns[3]) / 1024),
  };
};

const checkEndpoint = async (endpoint) => {
  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(endpoint.url, {
        headers: { 'user-agent': 'CodAstra-Monitor/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok)
        return {
          ...endpoint,
          ok: true,
          status: response.status,
          latencyMs: Date.now() - startedAt,
        };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 3) await sleep(1500);
  }
  return { ...endpoint, ok: false, error: lastError };
};

const checkSsl = (hostname) =>
  new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: true,
    });
    socket.setTimeout(10000);
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const daysRemaining = Math.floor(
        (new Date(certificate.valid_to).getTime() - Date.now()) / 86400000,
      );
      socket.end();
      resolve({ hostname, ok: true, daysRemaining, expiresAt: certificate.valid_to });
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS connection timed out')));
    socket.once('error', (error) => resolve({ hostname, ok: false, error: error.message }));
  });

const checkService = async (name) => {
  try {
    const { stdout } = await execFileAsync('systemctl', ['is-active', name]);
    return { name, ok: stdout.trim() === 'active', status: stdout.trim() };
  } catch (error) {
    return { name, ok: false, status: String(error.stdout || error.message).trim() };
  }
};

const checkPm2 = async () => {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], {
      env: { ...process.env, PM2_HOME: '/home/codastra/.pm2' },
    });
    const processes = JSON.parse(stdout);
    return pm2Processes.map((name) => {
      const process = processes.find((item) => item.name === name);
      return {
        name,
        ok: process?.pm2_env?.status === 'online',
        status: process?.pm2_env?.status || 'missing',
      };
    });
  } catch (error) {
    return pm2Processes.map((name) => ({
      name,
      ok: false,
      status: `PM2 check failed: ${error.message}`,
    }));
  }
};

const checkMongoDb = async () => {
  const name = 'MongoDB';
  if (!process.env.MONGO_URI)
    return { key: 'mongodb', name, ok: false, error: 'MONGO_URI is missing' };
  let connection;
  try {
    const { default: mongoose } =
      await import('file:///var/www/platterlabs/backend/node_modules/mongoose/index.js');
    connection = mongoose.createConnection(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    await connection.asPromise();
    await connection.db.admin().ping();
    return { key: 'mongodb', name, ok: true, detail: connection.name || 'connected' };
  } catch (error) {
    return { key: 'mongodb', name, ok: false, error: error.message };
  } finally {
    await connection?.close().catch(() => {});
  }
};

const checkBrevo = async () => {
  const name = 'Brevo email';
  if (!process.env.BREVO_API_KEY)
    return { key: 'brevo', name, ok: false, error: 'BREVO_API_KEY is missing' };
  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { key: 'brevo', name, ok: false, error: `HTTP ${response.status}` };
    return { key: 'brevo', name, ok: true, detail: 'API authenticated' };
  } catch (error) {
    return { key: 'brevo', name, ok: false, error: error.message };
  }
};

const checkCloudinary = async () => {
  const name = 'Cloudinary';
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = process.env;
  if (!cloudName || !apiKey || !apiSecret)
    return { key: 'cloudinary', name, ok: false, error: 'Cloudinary credentials are missing' };
  try {
    const authorization = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`,
      {
        headers: { authorization: `Basic ${authorization}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      return { key: 'cloudinary', name, ok: false, error: `HTTP ${response.status}` };
    return { key: 'cloudinary', name, ok: true, detail: 'API authenticated' };
  } catch (error) {
    return { key: 'cloudinary', name, ok: false, error: error.message };
  }
};

const sendEmail = async ({ subject, text }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM_ADDRESS || process.env.BREVO_SMTP_USER;
  const recipientList = String(process.env.MONITOR_ALERT_TO || senderEmail || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!apiKey || !senderEmail || recipientList.length === 0)
    throw new Error('Brevo API key, sender, or alert recipient is missing');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: {
        name: process.env.EMAIL_FROM_NAME || 'CodAstra Server Monitor',
        email: senderEmail,
      },
      to: recipientList.map((email) => ({ email })),
      subject,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Brevo returned HTTP ${response.status}: ${await response.text()}`);
};

const reportHeartbeat = async (exitCode, message = '') => {
  const baseUrl = process.env.FLAREWATCH_HEARTBEAT_URL;
  if (!baseUrl) return;
  try {
    const response = await fetch(`${baseUrl}/${exitCode}`, {
      method: 'POST',
      body: exitCode === 0 ? undefined : String(message).slice(0, 2000),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.error(`Heartbeat returned HTTP ${response.status}`);
  } catch (error) {
    console.error(`Heartbeat failed: ${error.message}`);
  }
};

const main = async () => {
  const checkedAt = new Date().toISOString();
  const hostnames = [...new Set(endpoints.map(({ url }) => new URL(url).hostname))];
  const [
    cpuPercent,
    memory,
    disk,
    endpointResults,
    sslResults,
    serviceResults,
    pm2Results,
    integrationResults,
  ] = await Promise.all([
    readCpu(),
    readMemory(),
    readDisk(),
    Promise.all(endpoints.map(checkEndpoint)),
    Promise.all(hostnames.map(checkSsl)),
    Promise.all(services.map(checkService)),
    checkPm2(),
    Promise.all([checkMongoDb(), checkBrevo(), checkCloudinary()]),
  ]);

  const failures = {};
  for (const endpoint of endpointResults)
    if (!endpoint.ok) failures[`endpoint.${endpoint.key}`] = `${endpoint.name}: ${endpoint.error}`;
  for (const ssl of sslResults) {
    if (!ssl.ok) failures[`ssl.${ssl.hostname}`] = `${ssl.hostname}: ${ssl.error}`;
    else if (ssl.daysRemaining < thresholds.sslDays)
      failures[`ssl.${ssl.hostname}`] =
        `${ssl.hostname}: certificate expires in ${ssl.daysRemaining} days`;
  }
  for (const service of [...serviceResults, ...pm2Results])
    if (!service.ok) failures[`service.${service.name}`] = `${service.name}: ${service.status}`;
  for (const integration of integrationResults)
    if (!integration.ok)
      failures[`integration.${integration.key}`] = `${integration.name}: ${integration.error}`;
  if (cpuPercent >= thresholds.cpu)
    failures['resource.cpu'] = `CPU usage is ${cpuPercent}% (threshold ${thresholds.cpu}%)`;
  if (memory.memoryPercent >= thresholds.memory)
    failures['resource.memory'] =
      `Memory usage is ${memory.memoryPercent}% (threshold ${thresholds.memory}%)`;
  if (memory.swapPercent >= thresholds.swap)
    failures['resource.swap'] =
      `Swap usage is ${memory.swapPercent}% (threshold ${thresholds.swap}%)`;
  if (disk.percent >= thresholds.disk)
    failures['resource.disk'] = `Disk usage is ${disk.percent}% (threshold ${thresholds.disk}%)`;

  const report = {
    checkedAt,
    hostname: os.hostname(),
    healthy: Object.keys(failures).length === 0,
    resources: {
      cpuPercent,
      ...memory,
      diskPercent: disk.percent,
      diskAvailableMb: disk.availableMb,
    },
    endpoints: endpointResults,
    ssl: sslResults,
    services: [...serviceResults, ...pm2Results],
    integrations: integrationResults,
    failures,
  };
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(latestFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o640 });

  const previous = await readJson(stateFile, null);
  const previousFailures = previous?.failures || {};
  const newFailures = Object.keys(failures).filter((key) => !(key in previousFailures));
  const recovered = Object.keys(previousFailures).filter((key) => !(key in failures));
  const firstRun = previous === null;

  if (firstRun || newFailures.length > 0 || recovered.length > 0) {
    const lines = [
      `Server: ${report.hostname}`,
      `Checked: ${checkedAt}`,
      `Overall status: ${report.healthy ? 'HEALTHY' : 'WARNING'}`,
      '',
      `CPU: ${cpuPercent}%`,
      `Memory: ${memory.memoryPercent}%`,
      `Swap: ${memory.swapPercent}%`,
      `Disk: ${disk.percent}%`,
      '',
      'Endpoint status:',
      ...endpointResults.map(
        (item) => `${item.name}: ${item.ok ? `UP (${item.latencyMs} ms)` : `DOWN (${item.error})`}`,
      ),
      '',
      'Service and process status:',
      ...[...serviceResults, ...pm2Results].map(
        (item) => `${item.name}: ${item.ok ? 'ONLINE' : 'FAILED'} (${item.status})`,
      ),
      '',
      'SSL status:',
      ...sslResults.map(
        (item) =>
          `${item.hostname}: ${item.ok ? `${item.daysRemaining} days remaining; expires ${item.expiresAt}` : item.error}`,
      ),
      '',
      'Integration status:',
      ...integrationResults.map(
        (item) => `${item.name}: ${item.ok ? `ONLINE (${item.detail})` : `FAILED (${item.error})`}`,
      ),
      '',
      'Alert thresholds:',
      `CPU: ${thresholds.cpu}%`,
      `Memory: ${thresholds.memory}%`,
      `Swap: ${thresholds.swap}%`,
      `Disk: ${thresholds.disk}%`,
      `SSL: ${thresholds.sslDays} days remaining`,
    ];
    if (newFailures.length > 0)
      lines.push('', 'New problems:', ...newFailures.map((key) => `- ${failures[key]}`));
    if (recovered.length > 0)
      lines.push('', 'Recovered:', ...recovered.map((key) => `- ${previousFailures[key]}`));

    const subjectLabel = (key, source) =>
      key.startsWith('resource.')
        ? key.split('.').at(-1).toUpperCase()
        : String(source[key] || key).split(':')[0];
    const alertNames = newFailures
      .map((key) => subjectLabel(key, failures))
      .join(', ')
      .slice(0, 120);
    const recoveryNames = recovered
      .map((key) => subjectLabel(key, previousFailures))
      .join(', ')
      .slice(0, 120);
    const subject =
      firstRun && report.healthy
        ? '[CodAstra Monitor] Monitoring enabled - all systems healthy'
        : newFailures.length > 0
          ? `[CodAstra Monitor] ALERT: ${alertNames}`
          : `[CodAstra Monitor] RECOVERED: ${recoveryNames}`;
    await sendEmail({ subject, text: lines.join('\n') });
  }

  await fs.writeFile(stateFile, `${JSON.stringify({ checkedAt, failures }, null, 2)}\n`, {
    mode: 0o640,
  });
  await reportHeartbeat(0);
  console.log(
    JSON.stringify({
      checkedAt,
      healthy: report.healthy,
      failures: Object.keys(failures),
      resources: report.resources,
    }),
  );
};

main().catch(async (error) => {
  await reportHeartbeat(1, error.message);
  console.error(error.stack || error.message);
  process.exit(1);
});
