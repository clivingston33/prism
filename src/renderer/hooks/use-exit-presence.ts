import { useEffect, useState } from "react";

export function useExitPresence(visible: boolean, duration = 150) {
  const [present, setPresent] = useState(visible);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let frame = 0;
    let timeout = 0;

    if (visible) {
      setPresent(true);
      frame = window.requestAnimationFrame(() => setActive(true));
    } else {
      setActive(false);
      timeout = window.setTimeout(() => setPresent(false), duration);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [duration, visible]);

  return { present, active };
}
