import { useEffect, useState } from "react";

/**
 * Whether the app's window has the keyboard focus, as the window reports it; false while another
 * app is in front or the window is in the background.
 *
 * @example
 *   const focused = useWindowFocus(); // false once the viewer switches to another app
 */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  return focused;
}
