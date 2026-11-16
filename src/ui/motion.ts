/**
 * The app's motion for `motion/react` elements, matching `--ease` and `--dur-move` in tokens.css,
 * so every dialog opens and every row fades alike (see docs/conventions/style-guide.md).
 *
 * @example
 * <motion.div className="dialog help" {...DIALOG_MOTION}>…</motion.div>
 * <motion.li transition={MOVE} exit={{ opacity: 0, transition: MOVE }}>…</motion.li>
 */
export const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** One movement: 160ms on the app's curve. */
export const MOVE = { duration: 0.16, ease: EASE };

/** How every dialog opens: a fade from slightly smaller. */
export const DIALOG_MOTION = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  transition: MOVE,
};
