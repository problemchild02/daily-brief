// djb2-style 32-bit hash → base-36 string.  Matches the implementation in ArticleNote.tsx.
export function hashUrl(url: string): string {
  let h = 0
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
