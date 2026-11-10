import type { WorkerConfig } from '@flarewatch/shared';

const proxyUrl = 'https://api.codastralabs.com/flarewatch-proxy/check';

const common = {
  method: 'GET' as const,
  expectedCodes: [200],
  timeout: 10000,
  checkEveryMinutes: 1,
  downAfterChecks: 2,
  reminderEveryChecks: 60,
  maxLatencyMs: 3000,
};

export const workerConfig: WorkerConfig = {
  monitors: [
    {
      ...common,
      id: 'platterlabs_api',
      name: 'PlatterLabs API',
      target: 'https://api.platterslabs.com/api/keep-alive',
      responseKeyword: '"service":"PlatterLabs API"',
      link: 'https://platterslabs.com',
      confirmVia: proxyUrl,
    },
    {
      ...common,
      id: 'bridgelabs_api',
      name: 'BridgeLabs API',
      target: 'https://api.bridgeelabs.com/api/health',
      responseKeyword: '"message":"API is healthy"',
      link: false,
      confirmVia: proxyUrl,
    },
    {
      ...common,
      id: 'astrafreight_api',
      name: 'AstraFreight API',
      target: 'https://api.astrafreight.codastralabs.com/api/v1/health',
      responseKeyword: '"service":"AstraFreight API"',
      link: false,
      confirmVia: proxyUrl,
    },
    {
      ...common,
      id: 'classora_api',
      name: 'Classora API',
      target: 'https://api.codastralabs.com/classora/health',
      responseKeyword: '"message":"healthy"',
      link: false,
      confirmVia: proxyUrl,
    },
    {
      ...common,
      id: 'attendora_api',
      name: 'Attendora API',
      target: 'https://api.codastralabs.com/attendora/api/health',
      responseKeyword: '"status":"ok"',
      link: false,
      confirmVia: proxyUrl,
    },
    {
      ...common,
      id: 'hostinger_proxy',
      name: 'Hostinger monitoring proxy',
      target: 'https://api.codastralabs.com/flarewatch-proxy/health',
      responseKeyword: '"status":"ok"',
      private: true,
      link: false,
    },
    ...(
      [
        ['hostinger_overall', 'Hostinger overall health', 'overall'],
        ['hostinger_resources', 'Hostinger CPU, memory, swap and disk', 'resources'],
        ['hostinger_infrastructure', 'Hostinger services and processes', 'infrastructure'],
        ['hostinger_integrations', 'MongoDB, Brevo and Cloudinary', 'integrations'],
      ] as const
    ).map(([id, name, category]) => ({
      ...common,
      id,
      name,
      target: `http://127.0.0.1:5097/health/${category}`,
      responseKeyword: '"status":"healthy"',
      checkProxy: proxyUrl,
      private: true,
      link: false as const,
      dependsOn: ['hostinger_proxy'],
    })),
    ...(
      [
        [
          'ssl_platterlabs',
          'SSL: api.platterslabs.com',
          'https://api.platterslabs.com/api/keep-alive',
        ],
        ['ssl_bridgelabs', 'SSL: api.bridgeelabs.com', 'https://api.bridgeelabs.com/api/health'],
        [
          'ssl_astrafreight',
          'SSL: api.astrafreight.codastralabs.com',
          'https://api.astrafreight.codastralabs.com/api/v1/health',
        ],
        [
          'ssl_codastra',
          'SSL: api.codastralabs.com',
          'https://api.codastralabs.com/classora/health',
        ],
      ] as const
    ).map(([id, name, target]) => ({
      id,
      name,
      method: 'GET' as const,
      target,
      expectedCodes: [200],
      timeout: 10000,
      checkEveryMinutes: 60,
      sslCheckEnabled: true,
      sslCheckDaysBeforeExpiry: 21,
      checkProxy: proxyUrl,
      private: true,
      link: false as const,
      dependsOn: ['hostinger_proxy'],
      reminderEveryChecks: 60,
    })),
    ...(
      [
        ['domain_platterlabs', 'Domain: platterslabs.com', 'platterslabs.com'],
        ['domain_bridgelabs', 'Domain: bridgeelabs.com', 'bridgeelabs.com'],
        ['domain_codastra', 'Domain: codastralabs.com', 'codastralabs.com'],
      ] as const
    ).map(([id, name, target]) => ({
      id,
      name,
      method: 'DOMAIN' as const,
      target,
      domainExpiryDays: 30,
      checkEveryMinutes: 1440,
      reminderEveryChecks: 1440,
      link: false as const,
    })),
    {
      id: 'hostinger_monitor_heartbeat',
      name: 'Hostinger monitoring heartbeat',
      method: 'HEARTBEAT',
      periodSeconds: 300,
      graceSeconds: 240,
      reminderEveryChecks: 60,
      private: true,
      link: false,
    },
  ],
  notification: {
    timeZone: 'Asia/Kathmandu',
    gracePeriod: 2,
    summaryAfter: 2,
    skipErrorChangeNotification: false,
  },
};
