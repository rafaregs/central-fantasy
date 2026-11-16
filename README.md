# Central Fantasy

Painel gratuito, em português, para ligas de fantasy football do **Sleeper**.
Basta digitar o usuário do Sleeper e escolher as ligas: sem cadastro e sem senha.

**O que tem no painel**
- **Resumo:** placar e projeção da semana, alertas de escalação e jogadores repetidos entre ligas.
- **Escalação:** melhor escalação pela projeção PPR, respeitando as vagas (FLEX só RB, WR ou TE).
- **Waivers:** livres que mais melhoram o seu time, com sugestão de quem dispensar e de lance de FAAB.
- **Trocas:** calculadora de trocas (vale para qualquer liga) e ideias de troca por liga.
- **Lesões, Classificação e Notícias:** notícias dos seus jogadores resumidas em português.
- **Bancada:** dicas de analistas do Instagram, resumidas em português e com link para o post original.

**Como funciona**
- O site é estático e fica no GitHub Pages. O navegador busca as ligas direto na API pública do Sleeper e, com o site aberto, atualiza a cada 5 minutos.
- O "Manter conectado" guarda o usuário e as ligas só no navegador da pessoa.
- De hora em hora, o GitHub Actions (`.github/workflows/atualizar-dados.yml`) atualiza `data/jogadores.json` (base de jogadores), `data/valores.json` (tabela geral de valores de troca) e `data/noticias.json` (notícias novas).
- As notícias são resumidas em português algumas vezes por dia (`scripts/traducoes.mjs`).
- A bancada fica em `data/bancada.json`. A tabela de referência dos valores fica em `data/referencia.json` (hoje, a do @fantasyfootballscott).

Site sem vínculo com o Sleeper. As sugestões são automáticas e servem de apoio.
