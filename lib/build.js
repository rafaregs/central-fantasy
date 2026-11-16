// Código compartilhado entre o navegador (app) e a tarefa diária (api/cron.js).
// Busca dados públicos do Sleeper e monta a base de jogadores e a tabela geral de valores de troca.

export const SLEEPER = 'https://api.sleeper.app';
const POS_Q = 'season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF';
const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

async function getJSON(path) {
  const r = await fetch(SLEEPER + path);
  if (!r.ok) throw new Error(`Sleeper ${r.status} em ${path}`);
  return r.json();
}

// Baixa tudo que é global (não depende de liga): jogadores, projeções, estatísticas e tendências.
export async function fetchSleeperBundle() {
  const state = await getJSON('/v1/state/nfl');
  const S = state.season, W = state.week;
  const [P, pW, pN, sS, sW, tr] = await Promise.all([
    getJSON('/v1/players/nfl'),
    getJSON(`/projections/nfl/${S}/${W}?${POS_Q}`),
    getJSON(`/projections/nfl/${S}/${W + 1}?${POS_Q}`),
    getJSON(`/stats/nfl/${S}?${POS_Q}`),
    getJSON(`/stats/nfl/${S}/${W}?${POS_Q}`),
    getJSON('/v1/players/nfl/trending/add?lookback_hours=48&limit=300'),
  ]);
  const byId = a => Object.fromEntries((a || []).map(x => [x.player_id, x.stats || {}]));
  return {
    season: S, week: W,
    P, PW: byId(pW), PN: byId(pN), SS: byId(sS), SW: byId(sW),
    TR: Object.fromEntries((tr || []).map(t => [t.player_id, t.count])),
  };
}

const r1 = x => (x == null ? null : Math.round(x * 10) / 10);

// Base compacta de jogadores: id -> [nome, pos, time, lesão, projSemana, projProxima, ptsTemporada, jogos, rankPos, adds48h, ptsSemana, parteCorpo]
export function buildPlayers(B) {
  const { P, PW, PN, SS, SW, TR } = B;
  const out = {};
  for (const [id, x] of Object.entries(P)) {
    if (!x || !FANTASY_POS.includes(x.position)) continue;
    const s = SS[id] || {};
    const relevant = x.position === 'DEF' || x.team || (s.gp || 0) > 0;
    if (!relevant) continue;
    if (!x.team && x.position !== 'DEF' && !(s.pts_ppr > 0)) continue;
    out[id] = [
      x.position === 'DEF' ? (x.last_name || id) : `${x.first_name} ${x.last_name}`,
      x.position, x.team || 'FA', x.injury_status || null,
      r1(PW[id]?.pts_ppr), r1(PN[id]?.pts_ppr), r1(s.pts_ppr), s.gp || 0,
      s.pos_rank_ppr || null, TR[id] || 0, r1(SW[id]?.pts_ppr), x.injury_body_part || null,
    ];
  }
  return out;
}

// Tabela geral de valor de troca (PPR, resto da temporada).
// SC = valores de referência (ex.: tabela do Scott) id -> valor. Quem não está em SC recebe valor estimado
// na mesma escala, calibrado por regressão linear por posição e mantido abaixo do piso da tabela.
export const MASTER_METHOD = 'Valor de troca PPR para o resto da temporada. S = valor da tabela de referência. M = estimado: base = 0,5×média PPR na temporada + 0,5×projeção PPR da próxima semana (IR ×0,4; Out ×0,8; Doubtful ×0,9), calibrada por regressão linear contra a tabela de referência em cada posição e reescalada para ficar abaixo do piso dela (QB <12, RB <15, WR <18, TE <8). K e DEF: 3 (top 5), 2 (top 12), 1 (resto).';

export function buildMaster(B, SC) {
  const { P, PN, SS } = B;
  const CAP = { QB: 11, RB: 14, WR: 17, TE: 7 };
  const PNp = id => PN[id]?.pts_ppr;
  const base = id => {
    const s = SS[id] || {};
    const ppg = s.gp ? (s.pts_ppr || 0) / s.gp : 0;
    const pn = PNp(id);
    let v = 0.5 * ppg + 0.5 * (pn == null ? ppg : pn);
    const inj = (P[id] || {}).injury_status;
    if (inj === 'IR') v *= 0.4; else if (['Out', 'Sus', 'PUP'].includes(inj)) v *= 0.8; else if (inj === 'Doubtful') v *= 0.9;
    return v;
  };
  const ids = Object.keys(P).filter(id => {
    const x = P[id];
    if (!x || !x.position) return false;
    if (x.position === 'DEF') return true;
    if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(x.position)) return false;
    const s = SS[id] || {};
    return SC[id] != null || ((s.gp || 0) > 0 && (s.pts_ppr || 0) >= 10) || (PNp(id) || 0) >= 3;
  });
  const fit = {}, mod = {};
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const pts = ids.filter(id => P[id].position === pos && SC[id] != null).map(id => [base(id), SC[id]]);
    let a = 0, b = 0;
    if (pts.length >= 3) {
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxy = 0, sxx = 0;
      pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; });
      a = sxx ? sxy / sxx : 0; b = my - a * mx;
    } else { a = 1; b = 0; } // sem referência: usa a própria base como escala
    fit[pos] = { a: Math.round(a * 100) / 100, b: r1(b), n: pts.length };
    const others = ids.filter(id => P[id].position === pos && SC[id] == null).map(id => [id, Math.max(0, a * base(id) + b)]);
    const mxF = Math.max(1e-6, ...others.map(o => o[1]));
    others.forEach(([id, f]) => { mod[id] = Math.max(0.5, r1(CAP[pos] * Math.min(1, f / mxF))); });
  }
  const kd = {};
  for (const pos of ['K', 'DEF']) {
    ids.filter(id => P[id].position === pos).sort((a, b) => base(b) - base(a))
      .forEach((id, i) => { kd[id] = i < 5 ? 3 : i < 12 ? 2 : 1; });
  }
  const players = {};
  for (const id of ids) {
    const x = P[id], pos = x.position;
    let v, src;
    if (SC[id] != null) { v = SC[id]; src = 'S'; }
    else if (pos === 'K' || pos === 'DEF') { v = kd[id]; src = 'M'; }
    else { v = mod[id]; src = 'M'; }
    if (v <= 0.5 && src === 'M' && pos !== 'K' && pos !== 'DEF') continue;
    players[id] = [pos === 'DEF' ? (x.last_name || id) : `${x.first_name} ${x.last_name}`, pos, x.team || 'FA', v, src, x.injury_status || null];
  }
  return { players, fit, method: MASTER_METHOD };
}

// Monta os dados de uma liga do usuário no formato usado pelo painel.
export async function fetchLeague(leagueId, myUserId, week, players) {
  const [lg, users, rosters, mu, mn, tx1, tx0] = await Promise.all([
    getJSON(`/v1/league/${leagueId}`),
    getJSON(`/v1/league/${leagueId}/users`),
    getJSON(`/v1/league/${leagueId}/rosters`),
    getJSON(`/v1/league/${leagueId}/matchups/${week}`).catch(() => []),
    getJSON(`/v1/league/${leagueId}/matchups/${week + 1}`).catch(() => []),
    getJSON(`/v1/league/${leagueId}/transactions/${week}`).catch(() => []),
    getJSON(`/v1/league/${leagueId}/transactions/${Math.max(1, week - 1)}`).catch(() => []),
  ]);
  const un = Object.fromEntries((users || []).map(u => [u.user_id, (u.metadata?.team_name || u.display_name || '').trim()]));
  const owned = new Set();
  const teams = (rosters || []).map(r => {
    (r.players || []).forEach(p => owned.add(p));
    const st = r.settings || {};
    return {
      rid: r.roster_id, team: un[r.owner_id] || 'Sem dono', me: r.owner_id === myUserId,
      w: st.wins || 0, l: st.losses || 0, t: st.ties || 0,
      pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100,
      pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100,
      faabUsed: st.waiver_budget_used || 0, wpos: st.waiver_position,
      starters: r.starters || [], players: r.players || [], reserve: r.reserve || [],
    };
  });
  // Livres no waiver: os melhores por posição (projeção da próxima semana, média e tendência).
  const score = a => (a[5] || 0) * 2 + (a[7] ? (a[6] || 0) / a[7] : 0) + (a[9] ? Math.log10(a[9]) : 0);
  const byPos = {};
  for (const [id, a] of Object.entries(players)) {
    if (owned.has(id) || (a[2] === 'FA' && a[1] !== 'DEF')) continue;
    (byPos[a[1]] = byPos[a[1]] || []).push([id, score(a)]);
  }
  const freeAgents = [];
  for (const [pos, arr] of Object.entries(byPos)) {
    arr.sort((x, y) => y[1] - x[1]);
    freeAgents.push(...arr.slice(0, ['K', 'DEF'].includes(pos) ? 5 : 15).map(x => x[0]));
  }
  const tx = [...(tx1 || []), ...(tx0 || [])].filter(t => t.status === 'complete')
    .sort((a, b) => b.created - a.created).slice(0, 12)
    .map(t => ({ type: t.type, at: t.created, rids: t.roster_ids, adds: t.adds || {}, drops: t.drops || {}, faab: t.settings?.waiver_bid ?? null }));
  const ls = lg.settings || {};
  return {
    id: leagueId, name: (lg.name || '').trim(), size: lg.total_rosters,
    waiverType: ls.waiver_type, budget: ls.waiver_budget, playoffStart: ls.playoff_week_start, playoffTeams: ls.playoff_teams,
    slots: lg.roster_positions || [], scoring: lg.scoring_settings || {}, teams,
    matchups: (mu || []).map(x => ({ mid: x.matchup_id, rid: x.roster_id, pts: x.points })),
    matchupsNext: (mn || []).map(x => ({ mid: x.matchup_id, rid: x.roster_id })),
    freeAgents, tx,
  };
}

// Notícias recentes (Sleeper / RotoWire / FantasyPros / RotoBaller) dos jogadores informados.
export async function fetchNews(ids, days = 4) {
  const cut = Date.now() - days * 864e5;
  const items = [];
  await Promise.all(ids.filter(id => !/^[A-Z]+$/.test(id)).map(async id => {
    try {
      const r = await getJSON(`/players/nfl/${id}/news?limit=3`);
      (r || []).filter(n => n.published > cut).forEach(n => items.push({
        id: `${id}-${n.published}`, pid: id, at: n.published,
        title: n.metadata?.title || '', summary: (n.metadata?.description || '').slice(0, 320),
        source: { rotowire: 'RotoWire', fantasy_pros: 'FantasyPros', rotoballer: 'RotoBaller' }[n.source] || n.source || '',
      }));
    } catch (e) { /* ignora jogador sem notícia */ }
  }));
  // uma notícia por jogador (a mais recente)
  const best = {};
  for (const it of items.sort((a, b) => b.at - a.at)) if (!best[it.pid]) best[it.pid] = it;
  return Object.values(best).sort((a, b) => b.at - a.at);
}
