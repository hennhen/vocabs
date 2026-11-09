// Builds public/words.txt: English words ranked by how common they are.
// Sources: SUBTLEX-US frequencies (ISC) intersected with `word-list` (MIT).
// Usage: node scripts/build-wordlist.mjs <dir containing node_modules with both packages>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.'
const dict = new Set(
  readFileSync(join(root, 'node_modules/word-list/words.txt'), 'utf8').split('\n').filter(Boolean),
)
const freq = JSON.parse(
  readFileSync(join(root, 'node_modules/subtlex-word-frequencies/index.json'), 'utf8'),
)
const seen = new Set()
const out = []
for (const { word } of freq) {
  const w = word.toLowerCase()
  if (w.length < 2 || !/^[a-z]+$/.test(w) || !dict.has(w) || seen.has(w)) continue
  seen.add(w)
  out.push(w)
}
writeFileSync('public/words.txt', out.join('\n') + '\n')
console.log(`wrote ${out.length} words`)
