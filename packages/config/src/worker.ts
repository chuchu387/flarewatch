import type { WorkerConfig } from '@flarewatch/shared';

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
    },
    {
      ...common,
      id: 'bridgelabs_api',
      name: 'BridgeLabs API',
      target: 'https://api.bridgeelabs.com/api/health',
      responseKeyword: '"message":"API is healthy"',
      link: false,
    },
    {
      ...common,
      id: 'astrafreight_api',
      name: 'AstraFreight API',
      target: 'https://api.astrafreight.codastralabs.com/api/v1/health',
      responseKeyword: '"service":"AstraFreight API"',
      link: false,
    },
    {
      ...common,
      id: 'classora_api',
      name: 'Classora API',
      target: 'https://api.codastralabs.com/classora/health',
      responseKeyword: '"message":"healthy"',
      link: false,
    },
    {
      ...common,
      id: 'attendora_api',
      name: 'Attendora API',
      target: 'https://api.codastralabs.com/attendora/api/health',
      responseKeyword: '"status":"ok"',
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
