// Roda de hora em hora no GitHub Actions (ver .github/workflows/atualizar-dados.yml).
// Gera: data/jogadores.json (base de jogadores), data/valores.json (tabela geral de valores de troca)
// e acrescenta notícias novas em data/noticias.json (em inglês; a tradução para português é feita depois).
import { readFile, writeFile } from 'node:fs/promises';
import { fetchSleeperBundle, buildPlayers, buildMaster, SLEEPER } from '../lib/build.js';

const readJSON = async (p, fb) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fb; } };
const writeJSON = (p, d) => writeFile(p, JSON.stringify(d) + '\n');
const now = new Date().toISOString();

const B = await fetchSleeperBundle();
const players = buildPlayers(B);
const ref = await readJSON('data/referencia.json', { values: {} });
const master = buildMaster(B, ref.values || {});

await writeJSON('data/jogadores.json', { season: B.season, week: B.week, updatedAt: now, players });
await writeJSON('data/valores.json', { updatedAt: now, refLabel: ref.label || null, refWeek: ref.week || null, refUrl: ref.url || null, ...master });

// ---------- notícias ----------
// Jogadores acompanhados: os mais relevantes da temporada, os machucados e os mais adicionados.
const tracked = Object.entries(players)
  .filter(([id, a]) => !/^[A-Z]+$/.test(id) && a[2] !== 'FA' && ((a[6] || 0) >= 25 || a[3] || (a[9] || 0) >= 2000 || master.players[id]))
  .sort((x, y) => (y[1][6] || 0) - (x[1][6] || 0))
  .slice(0, 450).map(([id]) => id);

const SRC = { rotowire: 'RotoWire', fantasy_pros: 'FantasyPros', rotoballer: 'RotoBaller' };
const KEEP_DAYS = 5, PER_PLAYER = 2;
const cut = Date.now() - KEEP_DAYS * 864e5;
const fresh = [];
for (let i = 0; i < tracked.length; i += 15) {
  const batch = tracked.slice(i, i + 15);
  await Promise.all(batch.map(async id => {
    try {
      const r = await fetch(`${SLEEPER}/players/nfl/${id}/news?limit=${PER_PLAYER}`);
      if (!r.ok) return;
      for (const n of (await r.json()) || []) {
        if (!(n.published > cut)) continue;
        fresh.push({
          id: `${id}-${n.published}`, pid: id, at: n.published,
          source: SRC[n.source] || n.source || '',
          title_en: n.metadata?.title || '', summary_en: (n.metadata?.description || '').slice(0, 400),
        });
      }
    } catch { /* ignora */ }
  }));
}

const old = await readJSON('data/noticias.json', { items: [] });
const byId = new Map((old.items || []).map(it => [it.id, it]));
for (const it of fresh) if (!byId.has(it.id)) byId.set(it.id, it); // mantém traduções já feitas
const perPlayer = {};
const items = [...byId.values()].filter(it => it.at > cut).sort((a, b) => b.at - a.at)
  .filter(it => (perPlayer[it.pid] = (perPlayer[it.pid] || 0) + 1) <= PER_PLAYER);
await writeJSON('data/noticias.json', { updatedAt: now, items });

const pending = items.filter(it => !it.title).length;
console.log(`semana ${B.week} · ${Object.keys(players).length} jogadores · ${Object.keys(master.players).length} valores · ${items.length} notícias (${pending} sem tradução)`);
