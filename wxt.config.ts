import { fileURLToPath } from 'node:url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'wxt';

/**
 * Public key that pins the extension ID of pre-release builds (GitHub Releases, installed with
 * "Load unpacked") to mdmjpiiemaagpcohlklceiamoehafmgj, whatever folder they are loaded from.
 * Same ID = same `chrome.storage.local`, so updating keeps the saved connections. Store builds
 * must not carry a key (the stores assign their own ID), so it is only added when
 * PRERELEASE_BUILD=1. The matching private key is not needed for unpacked installs and is not kept.
 */
const PRERELEASE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvBk/NwA0HJV14s2Q5KrXXeIBL4LQ5pgjiY4Q4jSwrsVomOWHm5ubGuij9FwgBTU+V3wMLFZMgsBXfs111I9/ViFMh84A8Bu3QZVfPcHZutcn45zqm78OZBijlljUgIpIG7vd6VTJuBPHTDra4HD/vuKmFBdRiiTgKsj+9m+qLVCVSvnLia6Ewqt8fjLgg+c6SRKW9nQR9HrfdokWSV2X5/LEwk0IyvWoqirnOrb1F4qzrINaSaG/91o8XRFT91g0P+X5D6gnRPX4XbArN8W5waN/ixyTkqAXhQDWxpbGBohWS/2RAjvtyoX6q+ENLp8jQ9kM0p1Bt9ZdEspaU6Q1zwIDAQAB';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  modules: ['@wxt-dev/module-vue'],
  // Explicit imports only: every module states where its helpers come from.
  imports: false,
  manifest: ({ mode }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'vi',
    permissions: ['storage', 'downloads'],
    // Each S3 endpoint origin is requested at runtime, after the user agrees.
    // Plain http is only allowed for a local S3 server.
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: {
      default_title: '__MSG_extName__',
    },
    // E2E builds only: browser automation cannot click the permission prompt, so the local
    // test server's origin (plus any in E2E_EXTRA_HOSTS, comma-separated match patterns, e.g.
    // for performance runs against a remote endpoint) is granted at install. Release builds
    // never contain this.
    ...(process.env.PRERELEASE_BUILD === '1' ? { key: PRERELEASE_PUBLIC_KEY } : {}),
    ...(mode === 'e2e'
      ? {
          host_permissions: [
            'http://localhost/*',
            ...(process.env.E2E_EXTRA_HOSTS?.split(',').filter(Boolean) ?? []),
          ],
        }
      : {}),
  }),
  vite: () => ({
    plugins: [
      vuetify({ autoImport: true }),
      // Messages are compiled at build time: MV3 forbids `unsafe-eval`, which the
      // runtime message compiler of the full vue-i18n build needs.
      VueI18nPlugin({
        include: [fileURLToPath(new URL('./src/i18n/*.json', import.meta.url))],
        runtimeOnly: true,
        compositionOnly: true,
        fullInstall: false,
        strictMessage: true,
        escapeHtml: true,
      }),
    ],
  }),
});
