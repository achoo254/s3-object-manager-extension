import { ref } from 'vue';

export interface Notice {
  id: number;
  /** i18n key */
  message: string;
  params?: Record<string, string | number>;
  color: 'success' | 'error' | 'info' | 'warning';
}

const notices = ref<Notice[]>([]);
let nextId = 1;

/** Short snackbar messages; the shell renders `notices`. */
export function useNotify() {
  function notify(message: string, params?: Notice['params'], color: Notice['color'] = 'success') {
    notices.value.push({ id: nextId++, message, params, color });
  }
  function dismiss(id: number) {
    notices.value = notices.value.filter((notice) => notice.id !== id);
  }
  return { notices, notify, dismiss };
}
