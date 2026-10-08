import { fileURLToPath } from 'node:url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'wxt';

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
