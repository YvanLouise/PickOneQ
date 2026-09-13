import { sourceCatalog } from '../server/catalog.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function plain(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
}
await mkdir('server/data', { recursive: true });
const results = [];
const previous = JSON.parse(await readFile('server/data/sources.json', 'utf8').catch(() => '[]'));
for (let i = 0; i < sourceCatalog.length; i += 5) {
  const batch = await Promise.all(sourceCatalog.slice(i, i + 5).map(async source => {
    const cached = previous.find(s => s.id === source.id && s.url === source.url && s.focus === source.focus && s.verified);
    if (cached && !process.argv.includes('--refresh')) return { ...cached, ...source };
    try {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(35000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => plain(m[1]));
      const matching = paragraphs.filter(p => source.focus.toLowerCase().split('|').some(term => p.toLowerCase().includes(term)) && p.length > 80);
      const text = matching.slice(0, 2).join(' ');
      if (text.length < 80) throw new Error('No relevant source paragraph');
      const excerpt = text.length > 900 ? text.slice(0, 900).replace(/\s+\S*$/, '') : text;
      console.log(`${source.id}: OK (${excerpt.length} chars)`);
      return { ...source, excerpt, retrievedAt: new Date().toISOString(), hash: createHash('sha256').update(excerpt).digest('hex'), verified: true, license: source.publisher.startsWith('OpenStax') ? 'See source edition license; attribution retained' : 'Short attributed source excerpt' };
    } catch (e) { console.log(`${source.id}: ${e.message}`); return { ...source, verified: false, error: e.message }; }
  }));
  results.push(...batch);
}
await writeFile('server/data/sources.json', JSON.stringify(results, null, 2));
console.log(`${results.filter(s => s.verified).length}/${results.length} retrieved`);
