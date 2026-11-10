import type { PageConfig } from '@flarewatch/shared';

export const pageConfig: PageConfig = {
  title: 'CodAstra Systems Status',
  timezone: 'Asia/Kathmandu',
  links: [
    { label: 'CodAstra Labs', link: 'https://codastralabs.com' },
    { label: 'GitHub', link: 'https://github.com/chuchu387' },
  ],
  group: {
    'Production APIs': [
      'platterlabs_api',
      'bridgelabs_api',
      'astrafreight_api',
      'classora_api',
      'attendora_api',
    ],
    Domains: ['domain_platterlabs', 'domain_bridgelabs', 'domain_codastra'],
    'Infrastructure (private)': [
      'hostinger_proxy',
      'hostinger_overall',
      'hostinger_resources',
      'hostinger_infrastructure',
      'hostinger_integrations',
      'hostinger_monitor_heartbeat',
    ],
    'Certificates (private)': [
      'ssl_platterlabs',
      'ssl_bridgelabs',
      'ssl_astrafreight',
      'ssl_codastra',
    ],
  },
};
