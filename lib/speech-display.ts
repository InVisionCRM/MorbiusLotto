/**
 * Compact live transcript for game voice HUDs — Web Speech often streams long
 * phrases; showing only the tail keeps the UI readable without affecting parsing
 * (parsing still uses full strings inside the recognition callback).
 */
export function truncateTranscriptWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  return `… ${words.slice(-maxWords).join(' ')}`;
}
