import { computed, ref } from 'vue';

/**
 * Long-running operations (folder delete, rename, copy) register here so the auto-lock does
 * not lock the vault — and unmount their dialogs — while they work without user input.
 */
const running = ref(0);

export function useBusy() {
  return {
    isBusy: computed(() => running.value > 0),
    /** Marks one operation as running; call the returned function when it ends. */
    begin(): () => void {
      running.value++;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        running.value--;
      };
    },
  };
}
