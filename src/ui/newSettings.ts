import type { Settings } from "../store";

/** The sections of the settings dialog, in the order of its navigation. */
export type SettingsSection = "general" | "notify" | "calendar" | "orgs" | "repos" | "look" | "avatars" | "rules" | "boards" | "untracked";

/**
 * Settings that came with a recent release, each with the section that holds it. They show a
 * "New" chip until the viewer opened that section once (see `useSeenSettings`). Entries go when
 * a release or two have passed; a fresh install sees none of them as new.
 */
export const NEW_SETTINGS: { key: keyof Settings; section: SettingsSection }[] = [
  { key: "tabToButtons", section: "look" },
];

/**
 * The new settings the viewer has not seen yet, optionally only those of one section.
 *
 * @param seen     Keys of the settings already seen.
 * @param section  Only the new settings in this section; all sections without it.
 *
 * @example
 *   unseenSettings([], "look"); // ["tabToButtons"]
 */
export function unseenSettings(seen: readonly string[], section?: SettingsSection): (keyof Settings)[] {
  return NEW_SETTINGS.filter((s) => (!section || s.section === section) && !seen.includes(s.key)).map((s) => s.key);
}
