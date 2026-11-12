/**
 * Forgets the draft of `id` once `sent` went out, unless the viewer has typed something else
 * since: a newer draft stays.
 *
 * @example
 *   settleDraft(drafts, "I_1", "Thanks!"); // drafts no longer holds I_1, if it still read "Thanks!"
 */
export function settleDraft(drafts: Map<string, string>, id: string, sent: string): void {
  if (drafts.get(id) === sent) drafts.delete(id);
}
