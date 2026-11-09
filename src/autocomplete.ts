let words: string[] | null = null
let loading: Promise<string[]> | null = null

/** Loads the frequency-ranked word list once (cached offline by the service worker). */
export function loadWords(): Promise<string[]> {
  if (words) return Promise.resolve(words)
  loading ??= fetch(`${import.meta.env.BASE_URL}words.txt`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`words.txt: ${r.status}`))))
    .then((t) => (words = t.split('\n').filter(Boolean)))
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}

/** Most common words starting with `prefix`, in frequency order. */
export function suggest(list: string[], prefix: string, limit = 8): string[] {
  const p = prefix.trim().toLowerCase()
  if (!p) return []
  const out: string[] = []
  for (const w of list) {
    if (w.startsWith(p) && w !== p) {
      out.push(w)
      if (out.length === limit) break
    }
  }
  return out
}
