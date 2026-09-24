# Ideathon Futuro do Esporte — Arena Hub

Plataforma 100% na nuvem para a ação presencial: **landing page**, **cadastro por QR Code**, **telão ao vivo** (nuvem das soluções mais votadas), **painel admin** completo (edição de teses e soluções, moderação por agente, seleção das melhores ideias, log de acessos) e **agente de moderação** (lista de termos + IA).

Feito em Node/Express + Postgres. Sobe no **Render** com banco no **Neon**. Sem framework pesado, um serviço só.

---

## O que cada página faz

| Página | URL | Quem acessa |
|---|---|---|
| Landing | `/` | Público — explica a ação e mostra o QR |
| Participar | `/participar.html` | Público — cadastro → tese → 3 soluções → frase |
| Telão | `/telao.html` | Público — dashboard ao vivo para projetar |
| Admin | `/admin.html` | Equipe Arena Hub — protegido por senha |

---

## Passo a passo do deploy (Render + Neon + GitHub)

### 1. Suba o código no GitHub
- Crie um repositório novo (ex.: `ideathon`) em github.com.
- Envie **todos os arquivos desta pasta** para ele (pelo site: "Add file → Upload files", arraste tudo; ou pelo GitHub Desktop). Não precisa subir `node_modules`.

### 2. Crie o banco no Neon
- Em neon.tech, crie um projeto (região mais perto do Brasil disponível).
- Em **Connection Details**, copie a **Pooled connection** string (algo como `postgresql://user:senha@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`).
- Guarde essa string — é o `DATABASE_URL`.

### 3. Crie o serviço no Render
- Em render.com: **New → Web Service** e conecte o repositório do GitHub.
- Configurações:
  - **Runtime**: Node
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Plan**: Free (para começar)
- Em **Environment**, adicione as variáveis (aba Environment → Add Environment Variable):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do Neon (passo 2) |
| `ADMIN_PASSWORD` | uma senha forte para o painel admin |
| `SESSION_SECRET` | uma string longa e aleatória qualquer |
| `ANTHROPIC_API_KEY` | (opcional) sua chave da Anthropic para o agente de IA |
| `MOD_MODEL` | (opcional) `claude-3-5-haiku-latest` |
| `NODE_ENV` | `production` |

- Clique em **Create Web Service**. O Render instala, sobe e o schema/seed do banco é criado sozinho na primeira execução.
- Ao final, você recebe uma URL tipo `https://ideathon-xxxx.onrender.com`.

> Atalho: o arquivo `render.yaml` já está incluído. Você pode usar **New → Blueprint** no Render, apontar para o repositório e só preencher as variáveis marcadas como `sync:false`.

### 4. Primeiro acesso
- Abra `https://SEU-APP.onrender.com/` — a landing com o QR.
- Abra `.../admin.html`, entre com a `ADMIN_PASSWORD` e confira a base, as teses e as configurações.
- Abra `.../telao.html` no telão/projetor.

### 5. QR Code
- No admin, aba **Configurações → QR Code da ação**, baixe o PNG e mande imprimir. O QR aponta para `.../participar.html`.

---

## O agente de moderação

Toda frase passa por duas camadas antes de ir ao telão:

1. **Lista de termos** (instantânea, no servidor): xingamentos e ofensas em PT-BR, com variações (`m3rd@`). Bloqueia na hora.
2. **IA** (se `ANTHROPIC_API_KEY` estiver configurada): classifica ofensa, discurso de ódio, conteúdo sexual, ameaça e **nome de pessoa real** → aprova, envia para revisão humana ou bloqueia, sempre com o motivo registrado.

Sem a chave de IA, funciona só a camada 1 (a frase é aprovada se passar na lista, marcada como "IA não configurada"). Você liga/desliga a moderação por IA no admin (Configurações). O que fica pendente aparece na fila do admin para aprovar ou bloquear manualmente.

Personalize a lista de termos em `moderation.js` (arrays `BAD` e `HATE`) e o prompt do agente na função `askAI`.

---

## Regras de negócio já implementadas
- **Uma resposta por pessoa**: cruzamento de nome + sobrenome + e-mail (e e-mail sozinho). Tentativa repetida é bloqueada.
- **3 soluções de 10 por tese**, escolhidas antes da frase; a frase tem limite de caracteres configurável (padrão 190).
- **Teses e soluções editáveis** no admin (criar, renomear, trocar cor, ativar/desativar, excluir).
- **Seleção das melhores** (checkbox) + **nota de 1 a 5** por ideia.
- **Log de acessos e ações** do admin, com IP e horário.
- **Exportação CSV** de toda a base.
- **Telão ao vivo** por atualização a cada 2,5s (nuvem de soluções + ranking de teses + ideia mais recente).

---

## Rodar localmente (opcional)
```bash
npm install
# crie um .env a partir do .env.example, apontando DATABASE_URL para um Postgres
# (para Postgres local sem SSL, use PGSSL=disable)
npm start
# abre em http://localhost:3000
```

---

## Deploy no Netlify (alternativa)
O Render é o caminho recomendado (serviço Node contínuo, mais simples com Postgres). O Netlify é feito para funções serverless e exigiria adaptar as rotas para Netlify Functions — dá mais trabalho e não é necessário. Fique no Render.

---

## Limites e próximos passos
- **Escala**: o app aguenta com folga um evento de centenas a poucos milhares de participantes. Para picos muito altos (milhares enviando no mesmo minuto), suba o plano do Render e do Neon e considere um cache/CDN na frente. O banco Postgres não é o gargalo; o pico de conexões simultâneas é.
- **Domínio próprio**: você pode apontar um subdomínio (ex.: `ideathon.arenahub.com.br`) para o serviço do Render nas configurações de Custom Domain — o QR passa a usar esse endereço automaticamente.
- **Sugestões de evolução**: consentimento de responsável para menores no fluxo, votação com múltiplos jurados, e um relatório final (PDF) das ideias por tese.
