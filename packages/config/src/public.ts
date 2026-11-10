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
  },
};
