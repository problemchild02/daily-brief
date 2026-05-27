export function readingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 225))
}
