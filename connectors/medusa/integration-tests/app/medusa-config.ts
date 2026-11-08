import { defineConfig } from '@medusajs/framework/utils';

const storefront = process.env['STOREFRONT_ORIGIN'] ?? 'http://localhost:8000';

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env['DATABASE_URL'] ?? 'postgres://localhost/medusa',
    http: {
      storeCors: storefront,
      adminCors: 'http://localhost:9000',
      authCors: `${storefront},http://localhost:9000`,
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-only-jwt-secret',
      cookieSecret: process.env['COOKIE_SECRET'] ?? 'test-only-cookie-secret',
    },
  },
  admin: { disable: process.env['COOLOFF_ADMIN'] !== '1' },
  plugins: [
    {
      // Linked into node_modules by integration-tests/run.sh.
      resolve: '@afkzona/cooloff-medusa',
      options: {
        traderName: 'Example Shop',
        timeZone: 'Europe/Vilnius',
        allowPartial: true,
        rateLimitPerMinute: Number(process.env['COOLOFF_RATE_LIMIT'] ?? '1000'),
      },
    },
  ],
  modules: [
    {
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/notification-local',
            id: 'local',
            options: { channels: ['email'] },
          },
        ],
      },
    },
  ],
});
