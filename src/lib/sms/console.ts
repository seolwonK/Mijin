import type { SmsProvider } from './index';

export const consoleProvider: SmsProvider = {
  name: 'console',
  async send(to, body) {
    console.log(`[SMS → ${to}] ${body}`);
  },
};
