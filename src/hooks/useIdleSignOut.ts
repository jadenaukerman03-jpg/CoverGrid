import { useEffect, useRef } from "react";

/**
 * Signs a person out after a stretch of no activity, so a shared nurses'-station
 * computer does not sit unlocked with someone's record on screen.
 */
export function useIdleSignOut(
  minutes: number | undefined,
  onTimeout: () => void,
  enabled: boolean,
) {
  const callback = useRef(onTimeout);
  callback.current = onTimeout;

  useEffect(() => {
    if (!enabled || !minutes || minutes <= 0) return;
    if (typeof window === "undefined") return;

    const limit = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      window.clearTimeout(timer);
      timer = setTimeout(() => callback.current(), limit);
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, enabled]);
}
