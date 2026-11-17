/** One continuous hold; release, backgrounding, and disabling cancel it. */
export function createHold(
  activate: () => void,
  clock: {
    set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clear: (id: ReturnType<typeof setTimeout>) => void;
  } = {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (id) => clearTimeout(id),
  },
  duration = 2000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let down = false;
  return {
    start() {
      if (down) return;
      down = true;
      const current = ++generation;
      timer = clock.set(() => {
        timer = undefined;
        if (down && current === generation) activate();
      }, duration);
    },
    cancel() {
      generation++;
      down = false;
      if (timer !== undefined) clock.clear(timer);
      timer = undefined;
    },
  };
}

/** A fresh app launch never authorizes a previously saved, unconfirmed SOS. */
export function createRetryAuthorization() {
  let allowed = false;
  return {
    allow() {
      allowed = true;
    },
    deny() {
      allowed = false;
    },
    permitted() {
      return allowed;
    },
  };
}
