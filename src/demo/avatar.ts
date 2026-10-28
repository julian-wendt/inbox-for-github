/**
 * A generated avatar as a data URL: the login's initials on a color picked from the login, so
 * people stay apart and nothing loads from the network.
 *
 * @example
 *   avatarUrl("lena-f"); // "data:image/svg+xml,%3Csvg …" showing "LF"
 */
export function avatarUrl(login: string): string {
  const initialsOf = (name: string) => {
    const parts = name.replace(/\[bot\]$/, "").split(/[-_.]/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  };
  const hue = ([...login].reduce((sum, c) => sum + c.charCodeAt(0), 0) * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="hsl(${hue} 45% 38%)"/><text x="20" y="26" font-family="sans-serif" font-size="18" font-weight="600" fill="#fff" text-anchor="middle">${initialsOf(login)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
