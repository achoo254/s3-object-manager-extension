import { createApp } from 'vue';
import { i18n } from '@/i18n';
import { vuetify } from '@/plugins/vuetify';
import { applyTokenCssVariables } from '@/styles/design-tokens';
import App from './App.vue';

applyTokenCssVariables();
createApp(App).use(vuetify).use(i18n).mount('#app');
