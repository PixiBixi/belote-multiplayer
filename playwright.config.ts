import { defineConfig, devices } from '@playwright/test'

/* 5050 can be taken locally (OrbStack) and Chrome blocks 5060: let the port move. */
const PORT = Number(process.env['E2E_PORT'] ?? 5050)

/* Installed Chrome locally, bundled chromium in CI. E2E_CHANNEL overrides; empty = bundled. */
const channel = process.env['E2E_CHANNEL'] ?? (process.env['CI'] === undefined ? 'chrome' : '')

/**
 * Point the suite at an already-running instance - a container, a staging box -
 * instead of letting Playwright start one. Useful to prove that what actually
 * ships plays a game, not merely that it serves files.
 */
const external = process.env['E2E_BASE_URL']

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  workers: 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'fr-FR',
        ...(channel === '' ? {} : { channel }),
      },
      testIgnore: /iphone\.spec/,
    },
    {
      name: 'iphone',
      testMatch: /iphone\.spec/,
      use: { browserName: 'webkit' },
    },
  ],
  /* The real server serving the real client build. A dev server would exercise a
     different artefact from the one that ships. */
  ...(external === undefined
    ? {
        webServer: {
          command: 'npm run build && node apps/server/dist/index.js',
          url: `http://127.0.0.1:${PORT}/healthz`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            NODE_ENV: 'production',
            LOG_LEVEL: 'warn',
            STATIC_ROOT: 'apps/web/dist',
            GRACE_PERIOD_MS: '60000',
            // A scripted game plays far faster than a person; the limiter is
            // exercised by the server's own integration tests.
            MOVE_BURST: '5000',
            MOVE_PER_SECOND: '5000',
            // Every browser shares 127.0.0.1, and those limits are per client IP.
            CREATE_BURST: '5000',
            CREATE_PER_SECOND: '5000',
            JOIN_BURST: '5000',
            JOIN_PER_SECOND: '5000',
            VOICE_CONTROL_BURST: '5000',
            VOICE_CONTROL_PER_SECOND: '5000',
            MAX_ROOMS_PER_IP: '5000',
          },
        },
      }
    : {}),
})
