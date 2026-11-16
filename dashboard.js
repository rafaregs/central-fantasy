// Painel da Central Fantasy: telas e lógica de escalação, waivers, trocas, lesões e classificação.
// Recebe os dados já carregados (Sleeper + tabela de valores) e desenha o painel em #tabs, #bar, #main e #fresh.
let LEAGUES=[];let LNAME={};
const SHORT=k=>{const n=LNAME[k]||k;return n.length>20?n.slice(0,18)+'…':n};
const TABS=[['resumo','Resumo'],['noticias','Notícias'],['escalacao','Escalação'],['waivers','Waivers'],['trocas','Trocas'],['ranking','Ranking'],['lesoes','Lesões'],['classificacao','Classificação'],['bancada','Bancada']];
const PER_LEAGUE={escalacao:1,waivers:1,trocas:1,classificacao:1};
const BAD=['Out','IR','Sus','PUP','NFI','COV'];
const ELIG={QB:['QB'],RB:['RB'],WR:['WR'],TE:['TE'],K:['K'],DEF:['DEF'],FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE'],REC_FLEX:['WR','TE'],WRRB_FLEX:['WR','RB']};
const KINDS={start:'Começar',sit:'Sentar',buy:'Comprar',hold:'Segurar',sell:'Vender',add:'Pegar no waiver',drop:'Dispensar',note:'Observação'};
const NEG={sit:1,sell:1,drop:1};
const dow=new Date().toLocaleDateString('en-US',{weekday:'short',timeZone:'America/Sao_Paulo'});
const S={meta:null,players:{},leagues:{},analysts:[],opinions:[],news:null,newsFilter:'all',master:null,calc:{a:[],b:[]},calcMsg:'',rkPos:'RB',rkQ:'',rkN:40,sheet:false,menu:[],tab:'resumo',league:'all',sem:(dow==='Mon'||dow==='Tue')?'N':'W',loaded:{},db:null,err:null};

const h=(t,a,...c)=>{const e=document.createElement(t);for(const[k,v] of Object.entries(a||{})){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k.startsWith('on')&&typeof v==='function')e.addEventListener(k.slice(2),v);else if(k==='style')e.style.cssText=v;else if(k==='value')e.value=v;else e.setAttribute(k,v===true?'':v)}for(const x of c.flat(Infinity)){if(x==null||x===false)continue;e.append(x instanceof Node?x:String(x))}return e};
const f1=x=>x==null?'—':(Math.round(x*10)/10).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const f0=x=>x==null?'—':Math.round(x).toLocaleString('pt-BR');
const kfmt=n=>n>=1000?(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':String(n);

function P(id){
  const a=S.players[id];
  if(!a)return{id,name:id==='0'?'Vaga vazia':id,pos:'?',team:'',inj:null,pw:null,pn:null,season:0,gp:0,rank:null,adds:0,ptsW:null,body:null};
  return{id,name:a[0],pos:a[1],team:a[2],inj:a[3],pw:a[4],pn:a[5],season:a[6]||0,gp:a[7]||0,rank:a[8],adds:a[9]||0,ptsW:a[10],body:a[11]};
}
const ppg=p=>p.gp?p.season/p.gp:0;
const proj=p=>S.sem==='W'?p.pw:p.pn;
const isBad=p=>BAD.includes(p.inj);
const noGame=p=>proj(p)==null&&!isBad(p)&&p.pos!=='?';
function eff(p){const v=proj(p);if(v==null||isBad(p))return 0;if(p.inj==='Doubtful')return v*.25;if(p.inj==='Questionable')return v*.85;return v}
function value(p){const pr=S.sem==='W'?p.pn:p.pn;const base=ppg(p);let v=.5*base+.5*(pr==null?base:pr);if(p.inj==='IR')v*=.2;else if(BAD.includes(p.inj))v*=.5;return v}
const weekNo=()=>S.meta?(S.sem==='W'?S.meta.week:S.meta.week+1):'';
const startSlots=L=>(L.slots||[]).filter(s=>!['BN','IR','TAXI'].includes(s));
const myTeam=L=>(L.teams||[]).find(t=>t.me);
const teamByRid=(L,rid)=>(L.teams||[]).find(t=>t.rid===rid);
function matchup(L,next){const me=myTeam(L);if(!me)return null;const arr=next?(L.matchupsNext||[]):(L.matchups||[]);const m=arr.find(x=>x.rid===me.rid);if(!m)return null;const o=arr.find(x=>x.mid===m.mid&&x.rid!==me.rid);return{me:m,opp:o,oppTeam:o?teamByRid(L,o.rid):null}}
const isNext=()=>S.sem==='N';
const resultTxt=(a,b)=>a==null||b==null?'—':`${f1(a)} x ${f1(b)}`;
function standings(L){return [...(L.teams||[])].sort((a,b)=>(b.w+b.t/2)-(a.w+a.t/2)||b.pf-a.pf)}

const ELIG_N=pos=>Object.values(ELIG).filter(a=>a.includes(pos)).length;
function optimize(L,team){
  const slots=startSlots(L);const reserve=new Set(team.reserve||[]);
  const pool=(team.players||[]).filter(id=>!reserve.has(id)).map(P);
  const order=slots.map((s,i)=>i).sort((a,b)=>(ELIG[slots[a]]||[slots[a]]).length-(ELIG[slots[b]]||[slots[b]]).length);
  const used=new Set();const res=new Array(slots.length).fill(null);
  for(const i of order){const el=ELIG[slots[i]]||[slots[i]];const c=pool.filter(p=>!used.has(p.id)&&el.includes(p.pos)).sort((a,b)=>eff(b)-eff(a)||ppg(b)-ppg(a))[0];if(c){used.add(c.id);res[i]=c.id}}
  const total=res.reduce((s,id)=>s+(id?eff(P(id)):0),0);
  const cur=(team.starters||[]);const curTotal=cur.reduce((s,id)=>s+(id&&id!=='0'?eff(P(id)):0),0);
  const optSet=new Set(res.filter(Boolean));
  /* alinhar a escalação ideal às vagas atuais: quem já é titular e continua fica na mesma vaga; cada troca é sempre dentro de uma vaga em que o jogador pode jogar */
  const fits=(slot,id)=>!!id&&(ELIG[slot]||[slot]).includes(P(id).pos);
  let aligned=new Array(slots.length).fill(null);const rem=new Set(optSet);
  cur.forEach((id,i)=>{if(i<slots.length&&rem.has(id)&&fits(slots[i],id)){aligned[i]=id;rem.delete(id)}});
  const tryPlace=(id,seen)=>{const idx=slots.map((s,i)=>i).sort((a,b)=>(aligned[a]?1:0)-(aligned[b]?1:0));for(const i of idx){if(seen.has(i)||!fits(slots[i],id))continue;seen.add(i);if(!aligned[i]||tryPlace(aligned[i],seen)){aligned[i]=id;return true}}return false};
  let ok=true;for(const id of [...rem].sort((a,b)=>(ELIG_N(P(a).pos))-(ELIG_N(P(b).pos)))){if(!tryPlace(id,new Set()))ok=false}
  if(!ok)aligned=res.slice();
  const moves=slots.map((slot,i)=>({slot,out:cur[i]&&cur[i]!=='0'?cur[i]:null,in:aligned[i]})).filter(m=>m.out!==m.in&&!(m.out==null&&m.in==null)&&(m.out==null||(m.in!=null&&eff(P(m.in))>eff(P(m.out))+0.05)));
  return{slots,lineup:aligned,total,curTotal,moves};
}

function opinionsFor(pid){const cut=Date.now()-14*864e5;return S.opinions.filter(o=>o.playerId===pid&&(!o.date||Date.parse(o.date)>cut))}

function leagueAlerts(k){
  const L=S.leagues[k];if(!L)return[];const me=myTeam(L);if(!me)return[];const out=[];const slots=startSlots(L);
  (me.starters||[]).forEach((id,i)=>{
    if(!id||id==='0'){out.push({lv:'danger',k,t:`Vaga de ${slots[i]} vazia no seu time titular`});return}
    const p=P(id);
    if(isBad(p))out.push({lv:'danger',k,t:`${p.name} (${p.pos}) é titular e está ${p.inj}`,s:p.body||''});
    else if(noGame(p))out.push({lv:'danger',k,t:`${p.name} (${p.pos}) é titular e não tem jogo/projeção na semana ${weekNo()}`,s:'Provável bye'});
    else if(p.inj==='Doubtful')out.push({lv:'danger',k,t:`${p.name} (${p.pos}) é titular e está Doubtful`,s:p.body||''});
    else if(p.inj==='Questionable')out.push({lv:'warn',k,t:`${p.name} (${p.pos}) é titular e está Questionable`,s:p.body||'Acompanhe o status antes do jogo'});
  });
  const opt=optimize(L,me);const gain=opt.total-opt.curTotal;
  if(gain>1.5)out.push({lv:'warn',k,t:`Sua escalação pode render +${f1(gain)} pts projetados`,s:'Veja a aba Escalação'});
  const reserve=new Set(me.reserve||[]);const starters=new Set(me.starters||[]);
  const dead=(me.players||[]).filter(id=>!reserve.has(id)&&!starters.has(id)).map(P).filter(p=>p.inj==='IR'||p.inj==='Out');
  if(dead.length)out.push({lv:'info',k,t:`${dead.length} jogador(es) machucado(s) ocupando o banco`,s:dead.map(p=>`${p.name} (${p.inj})`).join(', ')});
  return out;
}
function exposure(){
  const map={};
  for(const k of LEAGUES){const L=S.leagues[k];if(!L)continue;const me=myTeam(L);if(!me)continue;const st=new Set(me.starters||[]);
    for(const id of me.players||[]){if(['K','DEF'].includes(P(id).pos))continue;(map[id]=map[id]||[]).push({k,st:st.has(id)})}}
  return Object.entries(map).filter(([,v])=>v.length>1).map(([id,v])=>({p:P(id),v})).sort((a,b)=>b.v.length-a.v.length||value(b.p)-value(a.p));
}

function pcell(p,extra){
  return h('div',{class:'pl'},h('b',null,p.name,p.inj?h('span',{class:'inj '+p.inj},p.inj==='Questionable'?'Q':p.inj):null,noGame(p)?h('span',{class:'inj bye'},'sem jogo'):null),h('i',null,`${p.team||'—'}${extra?' · '+extra:''}`));
}
const posTag=x=>h('span',{class:'pos '+x},x==='SUPER_FLEX'?'SFLX':x);
function opChips(pid){const ops=opinionsFor(pid);if(!ops.length)return null;return h('div',null,ops.slice(0,2).map(o=>h('span',{class:'chip '+(NEG[o.kind]?'r':'g')},`${o.analyst||'Analista'}: ${KINDS[o.kind]||o.kind}`)))}
function alertEl(a){return h('div',{class:'alert a-'+a.lv},h('span',{class:'tag'},a.lv==='danger'?'Urgente':a.lv==='warn'?'Atenção':a.lv==='ok'?'OK':'Info'),h('div',null,a.k?h('div',{class:'lg-name'},LNAME[a.k]):null,h('div',null,a.t),a.s?h('div',{class:'small muted'},a.s):null))}

function semToggle(){
  if(!S.meta)return null;
  return h('div',{class:'seg'},[['W',`Semana ${S.meta.week} · resultado`],['N',`Semana ${S.meta.week+1} · próxima`]].map(([v,l])=>h('button',{class:S.sem===v?'on':'',onclick:()=>{S.sem=v;render()}},l)));
}
function leagueToggle(){
  return h('div',{class:'seg'},[['all','Todas'],...LEAGUES.map(k=>[k,SHORT(k)])].map(([v,l])=>h('button',{class:S.league===v?'on':'',onclick:()=>{S.league=v;render()}},l)));
}
const selLeagues=()=>LEAGUES.filter(k=>S.leagues[k]&&(S.league==='all'||S.league===k));

/* ---------- views ---------- */
function vResumo(){
  const root=h('div');
  const all=LEAGUES.flatMap(leagueAlerts).sort((a,b)=>({danger:0,warn:1,info:2}[a.lv]-{danger:0,warn:1,info:2}[b.lv]));
  const inst=installCard();if(inst)root.append(inst);
  root.append(h('h2',{class:'sec',style:'margin-top:4px'},`Alertas para a semana ${weekNo()}`));
  root.append(all.length?h('div',null,all.map(alertEl)):h('div',{class:'alert a-ok'},h('span',{class:'tag'},'OK'),h('div',null,'Nenhum problema nas suas escalações.')));
  root.append(h('h2',{class:'sec'},'Suas ligas'));
  root.append(h('div',{class:'grid g3'},LEAGUES.filter(k=>S.leagues[k]).map(k=>{
    const L=S.leagues[k];const me=myTeam(L);if(!me)return null;const st=standings(L);const rank=st.findIndex(t=>t.rid===me.rid)+1;const opt=optimize(L,me);const al=leagueAlerts(k);
    const last=matchup(L,false);const nx=isNext()?matchup(L,true):null;
    let mine,their,oppName,label;
    if(isNext()){mine=opt.total;their=nx&&nx.oppTeam?optimize(L,nx.oppTeam).total:null;oppName=nx&&nx.oppTeam?nx.oppTeam.team:'—';label=`Semana ${weekNo()} · projeção`}
    else{mine=last?last.me.pts:null;their=last&&last.opp?last.opp.pts:null;oppName=last&&last.oppTeam?last.oppTeam.team:'—';label=`Semana ${S.meta.week} · placar`}
    return h('div',{class:'card',id:'card-'+k},
      h('h3',null,LNAME[k]),
      h('div',{class:'small muted'},`${rank}º de ${L.size} · ${me.w}-${me.l}${me.t?'-'+me.t:''} · ${f1(me.pf)} pts feitos`),
      h('div',{class:'score'},h('div',null,h('div',{class:'n '+(mine>their?'win':mine<their?'lose':'')},f1(mine)),h('div',{class:'vs'},'Você')),h('div',{class:'vs',style:'text-align:center'},label),h('div',{style:'text-align:right'},h('div',{class:'n'},f1(their)),h('div',{class:'vs'},oppName))),
      isNext()?h('div',{class:'small muted',style:'margin-bottom:4px'},'Projeção da melhor escalação possível de cada lado'):null,
      isNext()?h('div',{class:'kv'},h('span',null,`Semana ${S.meta.week} (resultado)`),h('span',null,resultTxt(last&&last.me.pts,last&&last.opp&&last.opp.pts),last&&last.oppTeam?` vs ${last.oppTeam.team}`:'')):h('div',{class:'kv'},h('span',null,`Projeção da melhor escalação (sem. ${weekNo()})`),h('b',null,f1(opt.total))),
      h('div',{class:'kv'},h('span',null,'Playoffs'),h('span',null,`top ${L.playoffTeams||6}, a partir da semana ${L.playoffStart}`)),
      L.waiverType===2?h('div',{class:'kv'},h('span',null,'FAAB restante'),h('b',null,`${(L.budget||0)-(me.faabUsed||0)} de ${L.budget}`)):h('div',{class:'kv'},h('span',null,'Prioridade no waiver'),h('b',null,`${me.wpos}º`)),
      h('div',{class:'kv'},h('span',null,'Alertas'),h('b',{class:al.some(a=>a.lv==='danger')?'lose':''},String(al.length)))
    )})));
  const ex=exposure();
  root.append(h('h2',{class:'sec'},'Exposição: jogadores em mais de uma liga'));
  root.append(ex.length?h('div',{class:'card tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Jogador'),h('th',null,'Ligas'),h('th',{class:'r'},'Proj.'))),h('tbody',null,ex.map(({p,v})=>h('tr',null,h('td',null,pcell(p,p.pos)),h('td',null,v.map(x=>h('span',{class:'chip '+(x.st?'b':'')},(SHORT(x.k))+(x.st?' · titular':'')))),h('td',{class:'r'},f1(proj(p)))))))):h('div',{class:'empty'},'Nenhum jogador repetido.'));
  return root;
}

function vEscalacao(){
  const root=h('div');
  for(const k of selLeagues()){
    const L=S.leagues[k];const me=myTeam(L);if(!me)continue;const o=optimize(L,me);const cur=me.starters||[];
    const card=h('div',{class:'card',id:'lineup-'+k,style:'margin-bottom:12px'},h('h3',null,LNAME[k]),
      h('div',{class:'small muted'},`Atual: ${f1(o.curTotal)} pts projetados · Melhor possível: ${f1(o.total)} pts`));
    if(o.total-o.curTotal>0.05){
      card.append(h('h4',null,'Mudanças sugeridas'));
      for(const mv of o.moves){const pa=mv.out?P(mv.out):null,b=mv.in?P(mv.in):null;
        card.append(h('div',{class:'swap mv'},h('div',{class:'sl'},posTag(mv.slot)),
          h('div',{class:'so'},pa?h('div',null,h('span',{class:'out'},'Sai '),pa.name,h('div',{class:'small muted'},[pa.pos,pa.inj,noGame(pa)?'sem jogo':null,f1(eff(pa))+' proj.'].filter(Boolean).join(' · '))):h('span',{class:'muted'},'Vaga vazia')),
          h('div',{class:'arrow'},'→'),
          h('div',{class:'si'},b?h('div',null,h('span',{class:'in'},'Entra '),b.name,h('div',{class:'small muted'},`${b.pos} · ${f1(eff(b))} proj.`)):h('span',{class:'muted'},'Ninguém elegível'))));}
      card.append(h('div',{class:'small muted'},'Cada troca respeita a vaga: no FLEX só RB, WR ou TE; QB, K e DEF só nas vagas deles.'));
    }else card.append(alertEl({lv:'ok',t:'Sua escalação já é a melhor pela projeção.'}));
    card.append(h('h4',null,'Titulares (escalação ideal)'));
    const rows=o.slots.map((s,i)=>{const id=o.lineup[i];const p=id?P(id):null;const was=cur.includes(id);return h('tr',null,h('td',null,posTag(s)),h('td',null,p?pcell(p,`${p.pos}${was?'':' · entra'}`):h('span',{class:'muted'},'Sem jogador elegível'),p?opChips(p.id):null),h('td',{class:'r'},p?f1(proj(p)):'—'),h('td',{class:'r hm'},p?f1(ppg(p)):'—'))});
    card.append(h('div',{class:'tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Vaga'),h('th',null,'Jogador'),h('th',{class:'r'},'Proj.'),h('th',{class:'r hm'},'Média'))),h('tbody',null,rows))));
    const optSet=new Set(o.lineup.filter(Boolean));const bench=(me.players||[]).filter(id=>!optSet.has(id)).map(P).sort((a,b)=>eff(b)-eff(a));
    card.append(h('h4',null,'Banco e IR'));
    card.append(h('div',{class:'tbl'},h('table',null,h('tbody',null,bench.map(p=>h('tr',null,h('td',null,posTag(p.pos)),h('td',null,pcell(p,(me.reserve||[]).includes(p.id)?'IR (vaga de lesionado)':'banco'),opChips(p.id)),h('td',{class:'r'},f1(proj(p))),h('td',{class:'r hm'},f1(ppg(p)))))))));
    root.append(card);
  }
  return root;
}

/* Para cada livre: quem sairia do elenco (mesma posição primeiro, nunca o único QB/TE/K/DEF) e quanto a melhor escalação melhora, respeitando as vagas */
function waiverMove(L,me,p,base){
  const reserve=new Set(me.reserve||[]);const t2={...me,players:[...(me.players||[]),p.id]};
  const inLine=new Set(optimize(L,t2).lineup.filter(Boolean));
  const active=(me.players||[]).filter(id=>!reserve.has(id)).map(P);
  const count=pos=>active.filter(x=>x.pos===pos).length;
  const cands=active.filter(x=>!inLine.has(x.id));
  const byV=(a,b)=>value(a)-value(b);
  let drop=cands.filter(x=>x.pos===p.pos).sort(byV)[0];
  if(!drop)drop=cands.filter(x=>!(['QB','TE','K','DEF'].includes(x.pos)&&count(x.pos)<=1)).sort(byV)[0];
  if(!drop)return null;
  const t3={...me,players:(me.players||[]).filter(id=>id!==drop.id).concat(p.id),starters:me.starters};
  const gain=optimize(L,t3).total-base;
  const longTerm=value(p)-value(drop);
  return{drop,gain,longTerm};
}
function vWaivers(){
  const root=h('div');
  for(const k of selLeagues()){
    const L=S.leagues[k];const me=myTeam(L);if(!me)continue;const faab=L.waiverType===2;const rem=(L.budget||0)-(me.faabUsed||0);const base=optimize(L,me).total;
    const fas=(L.freeAgents||[]).map(P).filter(p=>p.pos!=='?'&&p.inj!=='IR'&&(p.gp>0||p.pn!=null)).map(p=>({p,mv:waiverMove(L,me,p,base)}));
    fas.sort((a,b)=>((b.mv?b.mv.gain:0)-(a.mv?a.mv.gain:0))||value(b.p)-value(a.p));
    const card=h('div',{class:'card',id:'waivers-'+k,style:'margin-bottom:12px'},h('h3',null,LNAME[k]),
      h('div',{class:'small muted'},faab?`FAAB: você tem ${rem} de ${L.budget}`:`Waiver por prioridade: você é o ${me.wpos}º`,` · Ordenado por quanto cada um melhora a sua melhor escalação na semana ${weekNo()}, respeitando as vagas.`));
    const rows=fas.slice(0,25).map(({p,mv})=>{const now=mv&&mv.gain>0.5;const later=mv&&!now&&mv.longTerm>1&&!['K','DEF'].includes(p.pos);
      let bid=null;if(faab&&(now||later)){let pct=.02;if(p.adds>300000)pct+=.12;else if(p.adds>100000)pct+=.07;else if(p.adds>30000)pct+=.03;pct+=Math.min(.15,Math.max(0,mv.gain)*.015+Math.max(0,mv.longTerm)*.01);bid=Math.max(1,Math.round(rem*pct))}
      return h('tr',null,h('td',null,posTag(p.pos)),h('td',null,pcell(p,p.rank?`${p.pos}${p.rank} na temporada`:''),now?h('span',{class:'chip g'},`+${f1(mv.gain)} pts na escalação · dispensa ${mv.drop.name} (${mv.drop.pos})`):later?h('span',{class:'chip b'},`Melhor que ${mv.drop.name} (${mv.drop.pos}) no resto da temporada`):null,opChips(p.id)),h('td',{class:'r'},f1(proj(p))),h('td',{class:'r hm'},f1(ppg(p))),h('td',{class:'r hm'},p.adds?kfmt(p.adds):'—'),faab?h('td',{class:'r'},bid?`~${bid}`:'—'):null)});
    card.append(h('div',{class:'tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,''),h('th',null,'Livre no waiver'),h('th',{class:'r'},`Proj. s${weekNo()}`),h('th',{class:'r hm'},'Média'),h('th',{class:'r hm'},'Adds 48h'),faab?h('th',{class:'r'},'Lance'):null)),h('tbody',null,rows))));
    if(faab)card.append(h('div',{class:'small muted',style:'margin-top:8px'},'O lance sugerido é uma estimativa a partir do seu orçamento restante, de quanto o jogador melhora seu time e de quantos times estão adicionando ele.'));
    root.append(card);
  }
  return root;
}

const scottV=id=>{const m=S.master&&S.master.players&&S.master.players[id];return m?m[3]:null};
function posNeeds(L){
  const sl=startSlots(L);const c=x=>sl.filter(s=>s===x).length;const fl=sl.filter(s=>s==='FLEX'||s==='WRRB_FLEX').length;const sf=c('SUPER_FLEX');
  return{QB:c('QB')+sf,RB:c('RB')+(fl?1:0),WR:c('WR')+(fl?1:0),TE:c('TE')};
}
function teamStrength(L,t){const need=posNeeds(L);const out={};for(const pos of Object.keys(need)){const v=(t.players||[]).map(P).filter(p=>p.pos===pos).map(value).sort((a,b)=>b-a);out[pos]=v.slice(0,need[pos]).reduce((s,x)=>s+x,0)}return out}
/* ---------- calculadora de trocas (valor geral, independe da liga) ---------- */
const MV=id=>{const m=S.master&&S.master.players&&S.master.players[id];return m?{id,name:m[0],pos:m[1],team:m[2],v:m[3],src:m[4],inj:m[5]}:null};
function calcResult(){
  const A=S.calc.a.map(MV).filter(Boolean),B=S.calc.b.map(MV).filter(Boolean);
  const sum=a=>a.reduce((s,p)=>s+p.v,0);let ta=sum(A),tb=sum(B);let adjA=0,adjB=0;
  if(A.length&&B.length&&A.length!==B.length){
    const more=A.length>B.length?A:B,extra=[...more].sort((x,y)=>x.v-y.v).slice(0,Math.abs(A.length-B.length));
    const prem=Math.round(sum(extra)*0.2*10)/10;if(A.length<B.length)adjA=prem;else adjB=prem}
  const fa=ta+adjA,fb=tb+adjB,diff=fb-fa,pct=Math.max(fa,fb)?diff/Math.max(fa,fb):0;
  return{A,B,ta,tb,adjA,adjB,fa,fb,diff,pct}
}
function vCalc(){
  const card=h('div',{class:'card',id:'trade-calculator',style:'margin-bottom:16px'},h('h3',null,'Calculadora de trocas'),
    h('div',{class:'small muted'},'Vale para qualquer liga: compara só o valor dos jogadores (PPR, resto da temporada), pela tabela geral do site, atualizada de hora em hora.'+(S.master&&S.master.refLabel?` Referência: ${S.master.refLabel}${S.master.refWeek?' (semana '+S.master.refWeek+')':''}; os demais valores são estimados na mesma escala.`:'')));
  if(!S.master){card.append(h('div',{class:'empty'},'A tabela de valores ainda não carregou.'));return card}
  const all=Object.keys(S.master.players).map(MV).sort((a,b)=>b.v-a.v);const label=p=>`${p.name} (${p.pos} ${p.team})`;
  const side=(key,title,cls)=>{const ids=S.calc[key];const inp=h('input',{list:'calc-list',placeholder:'Digite o nome do jogador',id:'calc-in-'+key});
    const add=()=>{const v=inp.value.trim().toLowerCase();if(!v)return;const p=all.find(x=>label(x).toLowerCase()===v)||all.find(x=>x.name.toLowerCase()===v)||all.find(x=>x.name.toLowerCase().includes(v));if(!p){S.calcMsg='Jogador não encontrado na tabela.';render();return}
      if(S.calc.a.includes(p.id)||S.calc.b.includes(p.id)){S.calcMsg='Esse jogador já está na troca.';render();return}if(ids.length>=6){S.calcMsg='Máximo de 6 jogadores por lado.';render();return}S.calcMsg='';ids.push(p.id);render();setTimeout(()=>{const e=document.getElementById('calc-in-'+key);if(e)e.focus()},0)};
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add()}});inp.addEventListener('change',()=>{if(all.some(x=>label(x)===inp.value))add()});
    const total=ids.map(MV).filter(Boolean).reduce((s,p)=>s+p.v,0);
    return h('div',{class:'card',style:'background:var(--bg)'},h('div',{class:'lg-name '+cls},title),
      h('div',{style:'display:flex;gap:6px;margin:8px 0'},inp,h('button',{class:'btn',type:'button',onclick:add},'Adicionar')),
      ids.length?h('div',null,ids.map(MV).filter(Boolean).map(p=>h('div',{class:'kv',style:'align-items:center'},h('span',null,posTag(p.pos),' ',p.name,h('span',{class:'small muted'},` ${p.team}`),p.inj?h('span',{class:'inj '+p.inj},p.inj==='Questionable'?'Q':p.inj):null,p.src==='M'?h('span',{class:'small muted'},' · estimado'):null),h('span',null,h('b',null,'$'+f1(p.v)),' ',h('button',{class:'ghost',type:'button','aria-label':'Remover',onclick:()=>{S.calc[key]=ids.filter(x=>x!==p.id);render()}},'×'))))):h('div',{class:'small muted'},'Nenhum jogador ainda.'),
      h('div',{class:'kv',style:'margin-top:6px'},h('span',null,'Total'),h('b',null,'$'+f1(total))))};
  card.append(h('datalist',{id:'calc-list'},all.map(p=>h('option',{value:label(p)}))));
  card.append(h('div',{class:'grid g2',style:'margin-top:10px'},side('a','Você dá','out'),side('b','Você recebe','in')));
  if(S.calcMsg)card.append(h('div',{class:'err'},S.calcMsg));
  const r=calcResult();
  if(r.A.length&&r.B.length){
    const fair=Math.abs(r.pct)<=0.10;const lv=fair?'ok':r.diff>0?'ok':'danger';
    const verdict=fair?'Troca justa':r.diff>0?'Você ganha a troca':'Você perde a troca';
    const pctAbs=Math.round(Math.abs(r.pct)*100);
    const shareA=r.fa/(r.fa+r.fb||1)*100;
    card.append(h('div',{style:'margin-top:12px'},
      h('div',{style:'display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--chip)'},h('div',{style:`width:${shareA}%;background:var(--danger)`}),h('div',{style:`width:${100-shareA}%;background:var(--accent)`})),
      h('div',{class:'kv',style:'border:0'},h('span',{class:'out'},'Você dá: $'+f1(r.fa)),h('span',{class:'in'},'Você recebe: $'+f1(r.fb))),
      alertEl({lv:fair?'ok':lv,t:`${verdict}${fair?'':` por ${pctAbs}%`} (diferença de $${f1(Math.abs(r.diff))})`,s:(r.adjA||r.adjB)?`Inclui ajuste por número de jogadores: +$${f1(r.adjA||r.adjB)} para o lado que recebe menos jogadores, porque juntar valor num jogador só libera vaga no elenco e costuma valer mais. Diferença de até 10% conta como troca justa.`:'Diferença de até 10% conta como troca justa.'})));
    card.append(h('div',{style:'text-align:right'},h('button',{class:'ghost',type:'button',onclick:()=>{S.calc={a:[],b:[]};S.calcMsg='';render()}},'Limpar troca')));
  }
  return card;
}
function vTrocas(){
  const root=h('div');
  root.append(vCalc());
  root.append(h('h2',{class:'sec'},'Ideias de troca por liga'));
  for(const k of selLeagues()){
    const L=S.leagues[k];const me=myTeam(L);if(!me)continue;const need=posNeeds(L);const POS=Object.keys(need);
    const str=Object.fromEntries(L.teams.map(t=>[t.rid,teamStrength(L,t)]));
    const rank=(rid,pos)=>1+L.teams.filter(t=>str[t.rid][pos]>str[rid][pos]).length;
    const myR=Object.fromEntries(POS.map(p=>[p,rank(me.rid,p)]));
    const sorted=[...POS].sort((a,b)=>myR[a]-myR[b]);const surplus=sorted[0],weak=sorted[sorted.length-1];
    const card=h('div',{class:'card',id:'trades-'+k,style:'margin-bottom:12px'},h('h3',null,LNAME[k]),
      h('div',null,POS.map(p=>h('span',{class:'chip '+(p===surplus?'g':p===weak?'r':'')},`${p}: ${myR[p]}º`))),
      h('div',{class:'small muted',style:'margin-top:4px'},`Ranking da força dos seus titulares por posição entre ${L.size} times (valor = média PPR + projeção). Ponto forte: ${surplus} · Ponto fraco: ${weak}.`));
    const myPos=(me.players||[]).map(P).filter(p=>p.pos===surplus&&!isBad(p)).sort((a,b)=>value(b)-value(a));
    const give=myPos.length>need[surplus]?myPos.slice(1):myPos.slice(Math.max(0,myPos.length-1));
    const myWeak=(me.players||[]).map(P).filter(p=>p.pos===weak).map(value).sort((a,b)=>b-a);const floor=myWeak[need[weak]-1]||0;
    const ideas=[];
    for(const t of L.teams){if(t.me)continue;const rs=rank(t.rid,surplus),rw=rank(t.rid,weak);if(rw>L.size/2||rs<=3)continue;
      const targets=(t.players||[]).map(P).filter(p=>p.pos===weak&&!isBad(p)&&value(p)>floor+0.5);
      for(const g of give)for(const tg of targets){const vg=value(g),vt=value(tg);const diff=Math.abs(vg-vt)/Math.max(vg,vt,1);if(diff<=.18)ideas.push({t,g,tg,diff,gain:vt-floor})}}
    ideas.sort((a,b)=>b.gain-a.gain||a.diff-b.diff);
    card.append(h('h4',null,'Ideias de troca'));
    if(!ideas.length)card.append(h('div',{class:'small muted'},`Não encontrei uma troca equilibrada de ${surplus} por ${weak} nesta liga agora.`));
    const seen=new Set();
    for(const x of ideas){const key=x.t.rid+':'+x.tg.id;if(seen.has(key))continue;seen.add(key);if(seen.size>4)break;
      const sg=scottV(x.g.id),st=scottV(x.tg.id);
      const sNote=sg!=null&&st!=null?`Tabela de valores: você dá $${sg}, recebe $${st}${Math.abs(sg-st)<=Math.max(sg,st)*.15?' (troca justa)':st>sg?' (vantagem sua)':' (vantagem dele)'}`:null;
      card.append(h('div',{class:'swap'},h('div',null,h('span',{class:'out'},'Você dá '),x.g.name,h('div',{class:'small muted'},`${x.g.pos} · valor ${f1(value(x.g))}${sg!=null?' · $'+sg:''}`)),h('div',{class:'arrow'},'⇄'),h('div',null,h('span',{class:'in'},'Você recebe '),x.tg.name,h('div',{class:'small muted'},`${x.tg.pos} · valor ${f1(value(x.tg))}${st!=null?' · $'+st:''} · ${x.t.team}`))));
      if(sNote)card.append(h('div',{class:'small muted',style:'margin:-2px 0 8px 4px'},sNote));}
    if(S.master&&S.master.players){const mineV=(me.players||[]).map(P).filter(p=>scottV(p.id)!=null).sort((a,b)=>scottV(b.id)-scottV(a.id));
      card.append(h('h4',null,'Seu elenco pela tabela de valores'));
      card.append(h('div',null,mineV.length?mineV.map(p=>h('span',{class:'chip'},`${p.name} (${p.pos}) $${scottV(p.id)}`)):h('span',{class:'small muted'},'Nenhum jogador seu está na tabela.')));
      card.append(h('div',{class:'small muted',style:'margin-top:4px'},'Valores de troca em PPR para o resto da temporada, da tabela geral do app (atualizada todo dia).'));}
    card.append(h('h4',null,'Quem precisa do quê'));
    card.append(h('div',{class:'tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Time'),...POS.map(p=>h('th',{class:'r'},p)))),h('tbody',null,standings(L).map(t=>h('tr',{class:t.me?'me':''},h('td',null,t.team),...POS.map(p=>{const r=rank(t.rid,p);return h('td',{class:'r '+(r<=3?'win':r>=L.size-2?'lose':'')},r+'º')})))))));
    root.append(card);
  }
  return root;
}

function vLesoes(){
  const root=h('div');const map={};
  for(const k of LEAGUES){const L=S.leagues[k];if(!L)continue;const me=myTeam(L);if(!me)continue;const st=new Set(me.starters||[]);const rs=new Set(me.reserve||[]);
    for(const id of me.players||[]){const p=P(id);if(!p.inj&&!noGame(p))continue;(map[id]=map[id]||{p,where:[]}).where.push({k,role:st.has(id)?'titular':rs.has(id)?'IR':'banco'})}}
  const list=Object.values(map).sort((a,b)=>(b.where.some(w=>w.role==='titular')-a.where.some(w=>w.role==='titular'))||(isBad(b.p)-isBad(a.p)));
  root.append(h('div',{class:'small muted',style:'margin-bottom:8px'},`Jogadores dos seus times com status de lesão ou sem jogo na semana ${weekNo()}.`));
  root.append(list.length?h('div',{class:'card tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,'Jogador'),h('th',null,'Status'),h('th',null,'Onde'))),h('tbody',null,list.map(({p,where})=>h('tr',null,h('td',null,pcell(p,p.pos)),h('td',null,p.inj?h('span',null,p.inj,p.body?h('div',{class:'small muted'},p.body):null):'Sem projeção (bye?)'),h('td',null,where.map(w=>h('span',{class:'chip '+(w.role==='titular'?'r':'')},`${SHORT(w.k)} · ${w.role}`)))))))):h('div',{class:'empty'},'Ninguém machucado. Ótima notícia.'));
  return root;
}

function txEl(L,t){
  const team=rid=>{const x=teamByRid(L,rid);return x?x.team:'?'};
  const adds=Object.entries(t.adds||{}),drops=Object.entries(t.drops||{});
  const typ={waiver:'Waiver',free_agent:'Livre',trade:'Troca',commissioner:'Comissário'}[t.type]||t.type;
  const who=(t.rids||[]).map(team).join(' ↔ ');
  return h('div',{class:'kv',style:'display:block;padding:6px 0'},h('div',null,h('b',null,who),' ',h('span',{class:'chip'},typ),t.faab!=null?h('span',{class:'chip'},`$${t.faab}`):null,h('span',{class:'small muted'},' '+new Date(t.at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}))),
    h('div',{class:'small'},adds.map(([id])=>h('span',{class:'in',style:'margin-right:8px'},'+ '+P(id).name)),drops.map(([id])=>h('span',{class:'out',style:'margin-right:8px'},'− '+P(id).name))));
}
function vClass(){
  const root=h('div');
  for(const k of selLeagues()){
    const L=S.leagues[k];const st=standings(L);const cut=L.playoffTeams||6;
    const card=h('div',{class:'card',id:'standings-'+k,style:'margin-bottom:12px'},h('h3',null,LNAME[k]),h('div',{class:'small muted'},`Linha verde: zona de playoff (top ${cut})`));
    card.append(h('div',{class:'tbl'},h('table',null,h('thead',null,h('tr',null,h('th',null,'#'),h('th',null,'Time'),h('th',{class:'r'},'V-D'),h('th',{class:'r'},'Pró'),h('th',{class:'r hm'},'Contra'))),h('tbody',null,st.map((t,i)=>h('tr',{class:(t.me?'me ':'')+(i===cut-1?'cut':'')},h('td',null,i+1),h('td',null,t.team),h('td',{class:'r'},`${t.w}-${t.l}${t.t?'-'+t.t:''}`),h('td',{class:'r'},f1(t.pf)),h('td',{class:'r hm'},f1(t.pa))))))));
    const nxt=isNext()&&(L.matchupsNext||[]).length;
    const arr=nxt?L.matchupsNext.map(m=>{const t=teamByRid(L,m.rid);return{...m,pts:t?optimize(L,t).total:null}}):(L.matchups||[]);
    card.append(h('h4',null,nxt?`Confrontos da semana ${weekNo()} (projeção da melhor escalação)`:`Confrontos da semana ${S.meta.week}`));
    const mids=[...new Set(arr.map(m=>m.mid))].filter(x=>x!=null).sort((a,b)=>a-b);
    card.append(h('div',null,mids.map(mid=>{const ms=arr.filter(m=>m.mid===mid);const [a,b]=ms;const ta=teamByRid(L,a.rid),tb=b?teamByRid(L,b.rid):null;const mine=(ta&&ta.me)||(tb&&tb.me);
      return h('div',{class:'kv',style:mine?'background:var(--me);padding:5px 6px;border-radius:6px':''},h('span',null,ta?ta.team:'?',' ',h('b',{class:a.pts>(b?b.pts:0)?'win':''},f1(a.pts))),h('span',null,h('b',{class:b&&b.pts>a.pts?'win':''},b?f1(b.pts):'—'),' ',tb?tb.team:''))})));
    card.append(h('h4',null,'Transações recentes'));
    card.append(h('div',null,(L.tx||[]).slice(0,10).map(t=>txEl(L,t))));
    root.append(card);
  }
  return root;
}

function opEl(o){
  const del=null;
  return h('div',{class:'op '+(NEG[o.kind]?'neg':'')},h('div',{class:'h'},h('b',{style:'color:var(--ink)'},o.analyst||'Analista'),` · ${KINDS[o.kind]||o.kind} · ${o.playerName||''}`,o.date?' · '+new Date(o.date).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'',o.source&&o.source!=='manual'?` · via ${o.source}`:''),o.text?h('div',null,o.text):null,o.url?h('a',{href:o.url,target:'_blank',rel:'noopener',class:'small'},'Ver post'):null,h('div',{style:'text-align:right'},del));
}
let formMsg='';
function alert0(e){formMsg='Não consegui salvar: '+(e&&e.message||e);render()}
function vBancada(){
  const root=h('div');
  const mine=new Set(LEAGUES.flatMap(k=>{const t=S.leagues[k]&&myTeam(S.leagues[k]);return t?t.players:[]}));
  root.append(h('div',{class:'card',id:'analysts',style:'margin-bottom:12px'},h('h3',null,'Analistas acompanhados'),
    S.analysts.length?h('div',null,S.analysts.map(a=>{const handle=String(a.handle||'').replace(/^@/,'');return h('div',{class:'kv'},h('span',null,h('b',null,a.name),handle?h('a',{href:'https://www.instagram.com/'+handle+'/',target:'_blank',rel:'noopener',class:'small'},' @'+handle):null),a.platform?h('span',{class:'chip'},a.platform):null)})):h('div',{class:'small muted'},'Nenhum analista ainda.'),
    S.ig&&S.ig.readAt?h('div',{class:'small muted',style:'margin-top:6px'},'Posts lidos e resumidos em português em '+new Date(S.ig.readAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})+'. Cada dica tem o link do post original.'):null));
  const opsMine=S.opinions.filter(o=>mine.has(o.playerId));const others=S.opinions.filter(o=>!mine.has(o.playerId));
  root.append(h('h2',{class:'sec'},'Sobre jogadores que você tem'));
  root.append(opsMine.length?h('div',{class:'card'},opsMine.map(opEl)):h('div',{class:'empty'},'Nenhuma dica recente sobre os seus jogadores.'));
  root.append(h('h2',{class:'sec'},'Outras dicas'));
  root.append(others.length?h('div',{class:'card'},others.map(opEl)):h('div',{class:'empty'},'Nada por aqui ainda.'));
  return root;
}

function whereHas(pid){const out=[];for(const k of LEAGUES){const L=S.leagues[k];if(!L)continue;const me=myTeam(L);if(!me||!(me.players||[]).includes(pid))continue;out.push({k,role:(me.starters||[]).includes(pid)?'titular':(me.reserve||[]).includes(pid)?'IR':'banco'})}return out}
const TAGS={lesao:['Lesão','r'],desempenho:['Desempenho','b'],analistas:['Analista','g'],geral:['Geral','']};
function vNoticias(){
  const root=h('div');const N=S.news;
  const items=(N&&N.items)||[];
  const IG=S.ig||{};const igItems=(IG.posts||[]).concat(items.filter(i=>i.kind==='instagram')).sort((a,b)=>b.at-a.at);
  root.append(h('div',{class:'bar',style:'margin-top:0'},h('div',{class:'seg'},[['all','Todas'],['lesao','Lesões'],['desempenho','Desempenho']].map(([v,l])=>h('button',{class:S.newsFilter===v?'on':'',onclick:()=>{S.newsFilter=v;render()}},l)))));
  if(S.analysts.length&&(S.newsFilter==='all'||S.newsFilter==='analistas')){
    const card=h('div',{class:'card',id:'news-analysts',style:'margin-bottom:12px'},h('h3',null,'Analistas no Instagram'));
    if(!S.analysts.length)card.append(h('div',{class:'small muted'},'Cadastre seus analistas na aba Bancada.'));
    S.analysts.forEach(a=>{const handle=String(a.handle||'').replace(/^@/,'');const posts=igItems.filter(i=>i.analyst===a.name);
      card.append(h('div',{class:'kv',style:'display:block;padding:8px 0'},h('div',null,h('b',null,a.name),' ',handle?h('a',{href:'https://www.instagram.com/'+handle+'/',target:'_blank',rel:'noopener',class:'small'},'@'+handle):null,h('span',{class:'small muted'},posts.length?` · ${posts.length} post(s) recentes`:'')),
        posts.slice(0,3).map(p=>h('div',{class:'op'},h('div',{class:'h'},new Date(p.at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})),h('div',null,p.summary),p.url?h('a',{href:p.url,target:'_blank',rel:'noopener',class:'small'},'Ver post'):null))))});
    if(IG.readAt)card.append(h('div',{class:'small muted',style:'margin-top:6px'},'Lido em '+new Date(IG.readAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})+'. As dicas sobre jogadores também ficam na aba Bancada.'));
    else if(N&&N.instagramNote&&!igItems.length)card.append(alertEl({lv:'info',t:N.instagramNote}));
    root.append(card);
  }
  const list=items.filter(i=>i.kind!=='instagram'&&(S.newsFilter==='all'||i.tag===S.newsFilter));
  if(S.newsFilter!=='analistas'){
    if(!N)root.append(h('div',{class:'empty'},'Carregando notícias dos seus jogadores…'));
    else if(!list.length)root.append(h('div',{class:'empty'},'Nenhuma notícia nessa categoria.'));
    else root.append(h('div',{class:'grid g2'},list.map(i=>{const p=i.pid?P(i.pid):null;const w=i.pid?whereHas(i.pid):[];const tg=TAGS[i.tag]||TAGS.geral;
      return h('div',{class:'card',id:'news-'+i.id},
        h('div',{style:'display:flex;justify-content:space-between;gap:8px;align-items:center'},h('span',{class:'chip '+tg[1]},tg[0]),h('span',{class:'small muted'},new Date(i.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}))),
        h('div',{style:'font-weight:600;margin:6px 0 2px'},i.title,i.pending?h('span',{class:'chip',style:'margin-left:6px'},'tradução em breve'):null),
        p?h('div',{class:'small muted'},`${p.name} · ${p.pos} ${p.team}`):null,
        h('div',{style:'margin:6px 0'},i.summary),
        i.action?h('div',{class:'alert a-'+(i.tag==='lesao'?'warn':'info'),style:'margin:6px 0 4px'},h('span',{class:'tag'},'O que fazer'),h('div',null,i.action)):null,
        h('div',null,w.map(x=>h('span',{class:'chip '+(x.role==='titular'?'b':'')},`${SHORT(x.k)} · ${x.role}`)),i.source?h('span',{class:'small muted'},' Fonte: '+i.source):null))})));
  }
  if(N&&N.updatedAt)root.append(h('div',{class:'small muted',style:'margin-top:10px'},'Notícias atualizadas em '+new Date(N.updatedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})+'. Notícias de jogador do Sleeper (RotoWire, FantasyPros e RotoBaller), resumidas em português.'));
  return root;
}

/* ---------- ranking por posição (tabela geral de valores) ---------- */
const RK_POS=['QB','RB','WR','TE','K','DEF'];
function ownership(){
  const own={};
  for(const k of LEAGUES){const L=S.leagues[k];if(!L)continue;const m={};for(const t of L.teams||[])for(const id of t.players||[])m[id]=t;own[k]=m}
  return own;
}
function vRanking(){
  const root=h('div');
  if(!S.master||!S.master.players){root.append(h('div',{class:'empty'},'A tabela de valores ainda não carregou.'));return root}
  const own=ownership();
  const filt=S.rkF||'all';
  root.append(h('div',{class:'bar',style:'margin-top:0'},
    h('div',{class:'seg'},RK_POS.map(x=>h('button',{class:S.rkPos===x?'on':'',onclick:()=>{S.rkPos=x;S.rkN=40;render()}},x))),
    h('div',{class:'seg'},[['all','Todos'],['mine','Meus'],['free','Livres']].map(([v,l])=>h('button',{class:filt===v?'on':'',onclick:()=>{S.rkF=v;S.rkN=40;render()}},l)))));
  const q=h('input',{type:'search',placeholder:'Buscar jogador',value:S.rkQ,style:'margin-bottom:10px',oninput:e=>{S.rkQ=e.target.value;const pos=e.target.selectionStart;render();const n=document.getElementById('rk-q');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch{}}}});q.id='rk-q';
  root.append(q);
  const ql=S.rkQ.trim().toLowerCase();
  let list=Object.keys(S.master.players).map(MV).filter(x=>x&&x.pos===S.rkPos).sort((a,b)=>b.v-a.v);
  list.forEach((x,i)=>x.rk=i+1);
  if(ql)list=list.filter(x=>x.name.toLowerCase().includes(ql));
  const status=id=>LEAGUES.filter(k=>own[k]).map(k=>{const t=own[k][id];return{k,t,mine:!!(t&&t.me),free:!t}});
  if(filt==='mine')list=list.filter(x=>status(x.id).some(s=>s.mine));
  if(filt==='free')list=list.filter(x=>status(x.id).some(s=>s.free));
  const shown=list.slice(0,S.rkN);
  const card=h('div',{class:'card',id:'ranking'},h('h3',null,`Ranking ${S.rkPos}`),
    h('div',{class:'small muted',style:'margin-bottom:6px'},'Ordem pelo valor de troca (PPR, resto da temporada) da tabela geral, atualizada de hora em hora. Embaixo de cada nome: onde ele está nas suas ligas.'));
  if(!shown.length){card.append(h('div',{class:'empty'},'Nenhum jogador com esse filtro.'));root.append(card);return root}
  card.append(h('div',{class:'tbl'},h('table',null,
    h('thead',null,h('tr',null,h('th',{class:'r'},'#'),h('th',null,'Jogador'),h('th',{class:'r'},'Valor'),h('th',{class:'r'},`Proj. s${weekNo()}`),h('th',{class:'r hm'},'Média'))),
    h('tbody',null,shown.map(x=>{const p=S.players[x.id]?P(x.id):null;const st=status(x.id);
      return h('tr',{class:st.some(s=>s.mine)?'me':''},h('td',{class:'r muted'},x.rk),
        h('td',null,h('div',{class:'pl'},h('b',null,x.name,x.inj?h('span',{class:'inj '+x.inj},x.inj==='Questionable'?'Q':x.inj):null),h('i',null,`${x.team||'—'}${x.src==='M'?' · valor estimado':''}`)),
          h('div',{class:'own'},st.map(s=>h('span',{class:'chip '+(s.mine?'g':s.free?'b':'')},s.mine?`Seu · ${SHORT(s.k)}`:s.free?`Livre · ${SHORT(s.k)}`:`${SHORT(s.k)} · ${s.t.team}`)))),
        h('td',{class:'r'},h('b',null,'$'+f1(x.v))),h('td',{class:'r'},p?f1(proj(p)):'—'),h('td',{class:'r hm'},p?f1(ppg(p)):'—'))})))));
  if(list.length>shown.length)card.append(h('div',{style:'text-align:center;margin-top:10px'},h('button',{class:'ghost',type:'button',style:'padding:8px 14px;font-size:14px',onclick:()=>{S.rkN+=40;render()}},`Ver mais (${list.length-shown.length})`)));
  root.append(card);
  return root;
}

/* ---------- celular: barra de abas embaixo, menu "Mais" e aviso de instalação ---------- */
const ICON={
  resumo:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  escalacao:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  noticias:'<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5"/>',
  waivers:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  mais:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
const BNAV=[['resumo','Início'],['escalacao','Escalação'],['noticias','Notícias'],['waivers','Waivers'],['mais','Mais']];
const svg=k=>{const e=document.createElement('span');e.className='ic';e.innerHTML=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;return e};
function renderMobileNav(){
  const bn=document.getElementById('bnav');if(!bn)return;
  const sh0=document.getElementById('sheet');
  if(document.getElementById('app').classList.contains('hidden')){bn.classList.add('hidden');sh0.classList.add('hidden');return}
  bn.classList.remove('hidden');
  const main4=BNAV.slice(0,4).map(x=>x[0]);
  bn.replaceChildren(...BNAV.map(([id,l])=>{const on=id==='mais'?(S.sheet||!main4.includes(S.tab)):(!S.sheet&&S.tab===id);
    return h('a',{href:id==='mais'?'#':('#'+id),class:on?'on':'',onclick:e=>{if(id==='mais'){e.preventDefault();S.sheet=!S.sheet;render()}else S.sheet=false}},svg(id),h('span',null,l))}));
  const sh=document.getElementById('sheet');
  if(!S.sheet){sh.classList.add('hidden');sh.replaceChildren();return}
  sh.classList.remove('hidden');
  const more=TABS.filter(([id])=>!main4.includes(id));
  const close=()=>{S.sheet=false;render()};
  sh.replaceChildren(h('div',{class:'sheet-bg',onclick:close}),h('div',{class:'sheet-box'},
    h('div',{class:'sheet-grip'}),
    more.map(([id,l])=>h('a',{href:'#'+id,class:'sheet-item'+(S.tab===id?' on':''),onclick:()=>{S.sheet=false}},l)),
    S.menu.length?h('div',{class:'sheet-sep'}):null,
    S.menu.map(m=>h('button',{type:'button',class:'sheet-item',onclick:()=>{S.sheet=false;render();m.run()}},m.label))));
}
function installCard(){
  const I=S.install;if(!I||I.standalone||!I.mobile)return null;
  try{if(localStorage.getItem('cf_install_ok'))return null}catch{}
  const dismiss=()=>{try{localStorage.setItem('cf_install_ok','1')}catch{};render()};
  return h('div',{class:'alert a-info',style:'align-items:center'},h('span',{class:'tag'},'App'),
    h('div',{style:'flex:1'},h('div',null,h('b',null,'Instale a Central Fantasy no celular')),h('div',{class:'small muted'},I.can?'Fica com ícone na tela inicial e abre em tela cheia, como um app.':I.ios?'No Safari, toque em Compartilhar (quadrado com seta) e depois em "Adicionar à Tela de Início".':'No navegador, abra o menu ⋮ e toque em "Instalar app" ou "Adicionar à tela inicial".')),
    I.can?h('button',{class:'btn',type:'button',onclick:()=>{I.prompt();dismiss()}},'Instalar'):null,
    h('button',{class:'ghost',type:'button','aria-label':'Fechar',onclick:dismiss},'×'));
}
function alertBar(){
  const el=document.getElementById('alertbar');if(!el)return;
  if(!S.meta||!Object.keys(S.leagues).length||S.tab==='resumo'){el.replaceChildren();return}
  const al=LEAGUES.flatMap(leagueAlerts).filter(a=>a.lv!=='info');
  if(!al.length){el.replaceChildren();return}
  const urg=al.filter(a=>a.lv==='danger').length;
  el.replaceChildren(h('a',{href:'#resumo',class:'alertbar '+(urg?'a-danger':'a-warn')},h('span',{class:'tag'},urg?'Urgente':'Atenção'),
    h('span',{style:'flex:1'},urg?`${urg} problema(s) urgente(s) na escalação${al.length>urg?` e ${al.length-urg} ponto(s) de atenção`:''}`:`${al.length} ponto(s) de atenção na escalação`),h('span',{class:'muted'},'Ver ›')));
}

/* ---------- render ---------- */
function route(){const t=(location.hash||'').slice(1);const prev=S.tab;S.tab=TABS.some(x=>x[0]===t)?t:'resumo';S.sheet=false;render();if(prev!==S.tab)window.scrollTo(0,0)}
function render(){
  const tabs=document.getElementById('tabs');tabs.replaceChildren(...TABS.map(([id,l])=>h('a',{href:'#'+id,class:S.tab===id?'on':''},l)));
  const fr=document.getElementById('fresh');
  if(S.meta){const d=new Date(S.meta.updatedAt);const hrs=(Date.now()-d)/36e5;fr.replaceChildren('Temporada ',h('b',null,S.meta.season),' · semana ',h('b',null,S.meta.week),' · atualizado em ',h('b',null,d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})),hrs>30?h('span',{class:'stale'},' · desatualizado'):'')}
  else if(S.err)fr.textContent=S.err;
  const bar=document.getElementById('bar');bar.replaceChildren();
  if(S.meta&&!['bancada','noticias','ranking'].includes(S.tab))bar.append(semToggle());
  if(PER_LEAGUE[S.tab])bar.append(leagueToggle());
  renderMobileNav();alertBar();
  const main=document.getElementById('main');
  if(!S.meta||!Object.keys(S.leagues).length){
    main.replaceChildren(h('div',{class:'empty'},S.err||(S.loaded.meta?'Nenhuma liga carregada.':'Carregando…')));return}
  const v={ranking:vRanking,bancada:vBancada,resumo:vResumo,noticias:vNoticias,escalacao:vEscalacao,waivers:vWaivers,trocas:vTrocas,lesoes:vLesoes,classificacao:vClass}[S.tab];
  try{main.replaceChildren(v())}catch(e){main.replaceChildren(h('div',{class:'empty err'},'Erro ao montar esta tela: '+e.message))}
}

let mounted=false;
export function mountDashboard(o){
  S.players=o.players||{};S.master=o.master||null;S.leagues=o.leagues||{};
  LEAGUES=o.order||Object.keys(S.leagues);LNAME=o.names||{};
  S.meta={season:o.season,week:o.week,updatedAt:o.updatedAt||new Date().toISOString()};
  S.loaded.meta=1;S.err=null;if(!o.keep){S.league='all'}
  if(!mounted){window.addEventListener('hashchange',route);mounted=true}
  route();
}
export function setNews(items,updatedAt){
  const inj=/injur|\bout\b|questionable|doubtful|\bIR\b|injured reserve|ankle|hamstring|concussion|knee|groin|MRI|surgery|toe|calf|shoulder|illness|evaluat/i;
  S.news={updatedAt:updatedAt||new Date().toISOString(),items:(items||[]).map(n=>{
    const pt=!!n.title;const title=pt?n.title:(n.title_en||'');const summary=pt?(n.summary||''):(n.summary_en||'');
    return{id:n.id,pid:n.pid,at:n.at,source:n.source,kind:'news',title,summary,pending:!pt,tag:n.tag||(inj.test((n.title_en||'')+' '+(n.summary_en||''))?'lesao':'desempenho')}})};
  render();
}
export function setBancada(b){
  S.analysts=(b&&b.analysts)||[];S.opinions=((b&&b.opinions)||[]).slice().sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
  S.ig={readAt:b&&b.updatedAt,posts:(b&&b.posts)||[]};
  render();
}
export function currentTab(){return S.tab}
export function setMenu(items,install){S.menu=items||[];S.install=install||null;render()}
export function dashboardError(msg){S.err=msg;S.meta=null;render()}
