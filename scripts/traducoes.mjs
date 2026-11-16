// Ajuda na tradução das notícias para português.
//   node scripts/traducoes.mjs pendentes        → lista as notícias ainda sem tradução (JSON compacto)
//   node scripts/traducoes.mjs aplicar arq.json → grava as traduções em data/noticias.json
// Formato de arq.json: { "<id>": { "title": "...", "summary": "...", "tag": "lesao" | "desempenho" | "geral" } }
import { readFile, writeFile } from 'node:fs/promises';

const [cmd, file] = process.argv.slice(2);
const data = JSON.parse(await readFile('data/noticias.json', 'utf8'));
const players = JSON.parse(await readFile('data/jogadores.json', 'utf8')).players;

if (cmd === 'pendentes') {
  const list = data.items.filter(it => !it.title).map(it => {
    const p = players[it.pid] || [];
    return { id: it.id, jogador: `${p[0] || it.pid} (${p[1] || '?'} ${p[2] || ''})`, title: it.title_en, text: it.summary_en };
  });
  console.log(JSON.stringify(list, null, 1));
  console.error(`${list.length} pendentes`);
} else if (cmd === 'aplicar' && file) {
  const tr = JSON.parse(await readFile(file, 'utf8'));
  let n = 0;
  for (const it of data.items) {
    const t = tr[it.id];
    if (!t || !t.title) continue;
    it.title = String(t.title).trim();
    it.summary = String(t.summary || '').trim();
    it.tag = ['lesao', 'desempenho', 'geral'].includes(t.tag) ? t.tag : 'geral';
    n++;
  }
  data.translatedAt = new Date().toISOString();
  await writeFile('data/noticias.json', JSON.stringify(data) + '\n');
  console.log(`${n} notícias traduzidas`);
} else {
  console.log('uso: node scripts/traducoes.mjs pendentes | aplicar arquivo.json');
}
