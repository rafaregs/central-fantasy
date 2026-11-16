// Central Fantasy — conectar com o usuário do Sleeper, escolher ligas e carregar o painel.
// Sem cadastro: o usuário e as ligas ficam guardados só no navegador da pessoa.
import { SLEEPER, fetchLeague, fetchNews } from './lib/build.js';
import { mountDashboard, setNews, setBancada, dashboardError, setMenu } from './dashboard.js';

/* ---------- app instalável ---------- */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
const ua = navigator.userAgent || '';
const install = {
  ios: /iPhone|iPad|iPod/i.test(ua),
  mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || matchMedia('(max-width: 720px)').matches,
  standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  can: false, prompt: null,
};
let deferred = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferred = e; install.can = true;
  install.prompt = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch { /* */ } deferred = null; install.can = false; refreshMenu(); };
  refreshMenu();
});
window.addEventListener('appinstalled', () => { install.standalone = true; refreshMenu(); });
function refreshMenu() {
  if (!current) return;
  const items = [
    { label: 'Minhas ligas', run: () => { clearInterval(timer); connectView(current); } },
    { label: 'Atualizar agora', run: () => load(current, true) },
  ];
  if (!install.standalone) items.push({ label: install.can ? 'Instalar o app' : 'Como instalar o app', run: () => { if (install.can) install.prompt(); else { try { localStorage.removeItem('cf_install_ok'); } catch { /* */ } install.mobile = true; location.hash = '#resumo'; refreshMenu(); } } });
  items.push({ label: `Sair (${current.display || current.username})`, run: logout });
  setMenu(items, install);
}

const REFRESH_MIN = 5;
const KEY = 'cf_conexao';
const $auth = document.getElementById('auth');
const $app = document.getElementById('app');

const h = (t, a, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v); } for (const x of c.flat(Infinity)) { if (x == null || x === false) continue; e.append(x instanceof Node ? x : String(x)); } return e; };
const sleeper = p => fetch(SLEEPER + p).then(r => { if (!r.ok) throw new Error('Sleeper ' + r.status); return r.json(); });
const dataFile = name => fetch(`./data/${name}.json?t=${Math.floor(Date.now() / 60000)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);

/* ---------- conexão guardada no navegador ---------- */
const store = {
  get() {
    for (const s of [localStorage, sessionStorage]) { try { const v = JSON.parse(s.getItem(KEY) || 'null'); if (v && v.userId && v.leagues?.length) return v; } catch { /* sem acesso */ } }
    return null;
  },
  set(v, remember) {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(v)); } catch { /* navegador bloqueou */ }
  },
  clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* */ } },
};

/* ---------- tela de conexão ---------- */
function connectView(prev) {
  $app.classList.add('hidden'); $auth.classList.remove('hidden');
  document.getElementById('bnav').classList.add('hidden'); document.getElementById('sheet').classList.add('hidden');
  const err = h('div', { class: 'err' });
  const input = h('input', { name: 'sleeper', placeholder: 'ex.: jimmyblunt420', value: prev?.username || '', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const remember = h('input', { type: 'checkbox', id: 'lembrar', checked: prev ? !!prev.remember : true });
  const list = h('div');
  const form = h('form', { class: 'f', onsubmit: async e => {
    e.preventDefault(); err.textContent = ''; list.replaceChildren(h('div', { class: 'small muted' }, 'Procurando suas ligas…'));
    try {
      const uname = input.value.trim().replace(/^@/, '');
      const su = await sleeper('/v1/user/' + encodeURIComponent(uname));
      if (!su) { list.replaceChildren(); err.textContent = 'Não encontrei esse usuário no Sleeper. Confira o nome no seu perfil, no app do Sleeper.'; return; }
      const st = await sleeper('/v1/state/nfl');
      const leagues = (await sleeper(`/v1/user/${su.user_id}/leagues/nfl/${st.season}`)) || [];
      if (!leagues.length) { list.replaceChildren(); err.textContent = `Nenhuma liga de NFL de ${st.season} encontrada para ${su.display_name}.`; return; }
      const chosen = new Set((prev?.userId === su.user_id ? prev.leagues : []).map(l => l.id));
      const boxes = leagues.map(l => {
        const cb = h('input', { type: 'checkbox', value: l.league_id, checked: chosen.size ? chosen.has(l.league_id) : l.status !== 'pre_draft' });
        const status = { in_season: 'em andamento', pre_draft: 'antes do draft', drafting: 'em draft', complete: 'encerrada' }[l.status] || l.status;
        return { l, cb, el: h('label', { class: 'lg-opt' }, cb, h('div', null, h('b', null, (l.name || '').trim()), h('div', { class: 'small muted' }, `${l.total_rosters} times · ${status}`))) };
      });
      const go = h('button', { class: 'btn', type: 'button', onclick: () => {
        const sel = boxes.filter(b => b.cb.checked).map(b => ({ id: b.l.league_id, name: (b.l.name || '').trim() }));
        if (!sel.length) { err.textContent = 'Escolha pelo menos uma liga.'; return; }
        const conn = { username: su.username || uname, display: su.display_name || uname, userId: su.user_id, leagues: sel, remember: remember.checked };
        store.set(conn, remember.checked);
        dashboardView(conn);
      } }, 'Analisar estas ligas');
      list.replaceChildren(h('h4', null, `Ligas de ${su.display_name} (${st.season})`), ...boxes.map(b => b.el), h('div', { style: 'margin-top:10px' }, go));
    } catch { list.replaceChildren(); err.textContent = 'Não consegui falar com o Sleeper agora. Tente de novo em instantes.'; }
  } },
  h('label', null, 'Seu usuário do Sleeper', input),
  h('label', { class: 'check' }, remember, h('span', null, 'Manter conectado neste aparelho')),
  h('button', { class: 'btn', type: 'submit' }, 'Conectar'), err);
  $auth.replaceChildren(h('div', { class: 'card' },
    h('h1', null, 'CENTRAL ', h('span', null, 'FANTASY')),
    h('p', { class: 'muted' }, 'Seu painel de fantasy do Sleeper em português: escalação, waivers, trocas, lesões e notícias. Digite seu usuário do Sleeper para começar.'),
    form, list,
    h('p', { class: 'small muted', style: 'margin-top:16px' }, 'Não pedimos senha: o site só lê os dados públicos das ligas do Sleeper. Sem "manter conectado", tudo é esquecido quando você fecha a aba.'),
    prev ? h('button', { class: 'link', type: 'button', onclick: () => dashboardView(prev) }, 'Voltar ao painel') : null));
}

function logout() { store.clear(); clearInterval(timer); connectView(null); }

/* ---------- painel ---------- */
let timer = null, loading = false, current = null;
async function load(conn, keep) {
  if (loading) return; loading = true;
  try {
    const [jog, val, not, ban] = await Promise.all([dataFile('jogadores'), dataFile('valores'), dataFile('noticias'), dataFile('bancada')]);
    if (!jog || !jog.players) throw new Error('a base de jogadores ainda não foi gerada');
    const order = conn.leagues.map(l => l.id);
    const names = Object.fromEntries(conn.leagues.map(l => [l.id, l.name]));
    const res = await Promise.allSettled(order.map(id => fetchLeague(id, conn.userId, jog.week, jog.players)));
    const leagues = {};
    res.forEach((r, i) => { if (r.status === 'fulfilled') { leagues[order[i]] = r.value; names[order[i]] = r.value.name || names[order[i]]; } });
    if (!Object.keys(leagues).length) throw new Error('não consegui carregar suas ligas no Sleeper');
    mountDashboard({ players: jog.players, master: val, leagues, order: order.filter(id => leagues[id]), names, season: jog.season, week: jog.week, updatedAt: new Date().toISOString(), keep });
    setBancada(ban || {});
    // Notícias: as traduzidas do site; para jogador seu que ficou de fora, busca direto no Sleeper.
    const mine = [...new Set(Object.values(leagues).flatMap(L => L.teams.find(t => t.me)?.players || []))];
    const mineSet = new Set(mine);
    const fromSite = ((not && not.items) || []).filter(it => mineSet.has(it.pid));
    const best = {};
    for (const it of fromSite.sort((a, b) => b.at - a.at)) if (!best[it.pid]) best[it.pid] = it;
    setNews(Object.values(best).sort((a, b) => b.at - a.at), not && (not.translatedAt || not.updatedAt));
    const missing = mine.filter(id => !best[id] && !/^[A-Z]+$/.test(id));
    if (missing.length) {
      fetchNews(missing).then(extra => {
        const items = Object.values(best).concat(extra.map(x => ({ id: x.id, pid: x.pid, at: x.at, source: x.source, title_en: x.title, summary_en: x.summary })));
        setNews(items.sort((a, b) => b.at - a.at), not && (not.translatedAt || not.updatedAt));
      }).catch(() => {});
    }
  } catch (e) {
    if (!keep) dashboardError('Não consegui carregar os dados: ' + (e.message || e) + '. Tente de novo em instantes.');
  } finally { loading = false; }
}

function dashboardView(conn) {
  $auth.classList.add('hidden'); $app.classList.remove('hidden');
  document.getElementById('userbar').replaceChildren(
    h('span', { class: 'small muted' }, conn.display || conn.username),
    h('button', { class: 'ghost', type: 'button', onclick: () => { clearInterval(timer); connectView(conn); } }, 'Minhas ligas'),
    h('button', { class: 'ghost', type: 'button', onclick: logout }, 'Sair'));
  document.getElementById('main').replaceChildren(h('div', { class: 'empty' }, 'Carregando suas ligas…'));
  load(conn, false);
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') { dashboardView.last = Date.now(); load(conn, true); } }, REFRESH_MIN * 60000);
  current = conn; dashboardView.last = Date.now(); refreshMenu();
  if (!dashboardView.hooked) {
    dashboardView.hooked = true;
    document.addEventListener('visibilitychange', () => {
      if (current && !$app.classList.contains('hidden') && document.visibilityState === 'visible' && Date.now() - dashboardView.last > REFRESH_MIN * 60000) { dashboardView.last = Date.now(); load(current, true); }
    });
  }
}

/* ---------- início ---------- */
const saved = store.get();
if (saved) dashboardView(saved); else connectView(null);
