/** Parse a YouTube watch / youtu.be / embed URL. Never invents an id. */
export function youtubeIdFromUrl(url: string): string {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace(/^\//, '').slice(0, 11);
    if (parsed.searchParams.get('v')) return String(parsed.searchParams.get('v')).slice(0, 11);
    const embed = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
    if (embed) return embed[1].slice(0, 11);
  } catch {
    /* ignore */
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  return '';
}
