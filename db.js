// db.js — conexão com Postgres (Neon) + criação de schema e seed inicial.
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('[db] DATABASE_URL não definido. Configure a string de conexão do Neon/Postgres.');
}

// Neon exige SSL. Em Postgres local sem SSL, defina PGSSL=disable.
const ssl = process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };

export const pool = new Pool({ connectionString, ssl, max: 10 });

export async function query(text, params) {
  return pool.query(text, params);
}

// ---- Teses e soluções padrão (editáveis depois no admin) ----
const SEED_TESES = [
  { slug: 'fas', nome: 'Engajamento com fãs', cor: '#2C8BCD', solucoes: [
    'Torcida escolhe a música de entrada pelo app',
    'Ingresso mais barato para quem vem de transporte público',
    'Torcida vota quem dá a entrevista pós-jogo',
    'Card digital que pontua a cada ida ao estádio',
    'Liga de várzea com transmissão e figurinhas',
    'Avatar do atleta para interagir com a torcida',
    'Comunidade virtual do time o ano todo',
    'Realidade aumentada com curiosidades do jogo ao vivo',
    'Programa "primeira vez no estádio" para crianças',
    'Sócio-torcedor jovem com benefício na escola' ] },
  { slug: 'perf', nome: 'Performance humana', cor: '#F4B11C', solucoes: [
    'Sensor no tênis que avisa risco de lesão',
    'Treino por IA para quem não tem técnico',
    'App de saúde mental e controle emocional',
    'Colete que mede hidratação e lembra de beber',
    'App de sono e recuperação para atleta-estudante',
    'Fisioterapia por vídeo onde não há clínica',
    'Análise de vídeo do celular que corrige o gesto',
    'Alto rendimento com baixo orçamento',
    'Plano de longevidade esportiva do atleta',
    'Mentoria de atleta profissional para a base' ] },
  { slug: 'midia', nome: 'Mídia e entretenimento', cor: '#90C33A', solucoes: [
    'Transmissão em que você escolhe a câmera',
    'Narração colaborativa feita pela torcida',
    'Cortes de 3 min sobre atletas paralímpicos',
    'Transmissão imersiva em 360°',
    'Reprise dos melhores lances em Libras',
    'Desafios gamificados durante o jogo',
    'Estúdio para o atleta criar conteúdo nas redes',
    'Podcast feito pelos próprios atletas da base',
    'Comentarista por IA que explica a regra na hora',
    'Plataforma de clipes que remunera quem cria' ] },
  { slug: 'gestao', nome: 'Gestão e regras', cor: '#316181', solucoes: [
    'Cartão verde para quem ajuda o adversário caído',
    'Tempo parado de verdade, sem cera',
    'Árbitro explica a decisão no telão',
    'Placar de transparência das decisões',
    'Adolescente com voto no conselho do clube',
    'Comissão de atletas com voz nas regras',
    'Finanças do clube abertas num app',
    'Punição maior para racismo na arquibancada',
    'Novos formatos de competição mais dinâmicos',
    'Mesma estrutura e visibilidade para o esporte feminino' ] },
  { slug: 'sust', nome: 'Sustentabilidade', cor: '#17A2B8', solucoes: [
    'Uniformes de garrafa PET recolhida no estádio',
    'Refletor que só liga com gente na arquibancada',
    'Copos retornáveis com cashback',
    'App que integra o transporte no dia de jogo',
    'Energia solar cobrindo o telhado da arena',
    'Água da chuva reaproveitada no gramado',
    'Arena multiuso para esporte e comunidade',
    'Banco de doação de equipamento esportivo',
    'Coleta seletiva gamificada na saída',
    'Materiais reaproveitados viram nova camisa' ] },
  { slug: 'prod', nome: 'Produtos inteligentes', cor: '#E0567A', solucoes: [
    'Bola que conta passes certos no celular',
    'Chuteira que se ajusta sozinha ao pé',
    'Sensores que viram treino personalizado',
    'Rede de vôlei que apita ao toque',
    'Ecossistema digital do atleta num app só',
    'Camisa que mostra os batimentos do jogador',
    'Apito eletrônico que registra toda falta',
    'Trave com sensor de gol automático',
    'Tornozeleira que mede a explosão do salto',
    'App que vira qualquer quadra em quadra oficial' ] },
  { slug: 'arenas', nome: 'Arenas inteligentes', cor: '#7B57D8', solucoes: [
    'Tradução do que o técnico grita para a torcida',
    'Cadeira que vibra com a batida da torcida',
    'Quadra pública que acende ao chegar alguém',
    'Estádio que vira cinema e escola sem jogo',
    'Fila zero: lanche pelo app chega na cadeira',
    'Acessibilidade total em todos os setores',
    'Wi-Fi com replay instantâneo na mão',
    'Espaço de educação e formação na arena',
    'Iluminação que muda de cor com o jogo',
    'Sensor de lotação que abre portões no pico' ] },
];

const MODALIDADES = ['Futebol','Vôlei','Basquete','Natação','Atletismo','Skate','Judô','Tênis','Surfe','Ginástica','Handebol','E-sports','Outra'];

export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS event (
      id INT PRIMARY KEY DEFAULT 1,
      nome TEXT NOT NULL DEFAULT 'Ideathon Futuro do Esporte',
      subtitulo TEXT NOT NULL DEFAULT 'O futuro do esporte pela voz de vocês',
      aberto BOOLEAN NOT NULL DEFAULT TRUE,
      moderacao_ia BOOLEAN NOT NULL DEFAULT TRUE,
      max_frase INT NOT NULL DEFAULT 190,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT event_singleton CHECK (id = 1)
    );
    CREATE TABLE IF NOT EXISTS teses (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT '#FF5A36',
      ordem INT NOT NULL DEFAULT 0,
      ativa BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS solucoes (
      id SERIAL PRIMARY KEY,
      tese_id INT NOT NULL REFERENCES teses(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      ordem INT NOT NULL DEFAULT 0,
      ativa BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      person_key TEXT UNIQUE NOT NULL,
      email_key TEXT UNIQUE NOT NULL,
      numero TEXT,
      nome TEXT NOT NULL DEFAULT '',
      sobrenome TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      modalidade TEXT,
      tese_slug TEXT NOT NULL,
      picks INT[] NOT NULL DEFAULT '{}',
      frase TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      agente_resultado TEXT,
      agente_motivo TEXT,
      selecionada BOOLEAN NOT NULL DEFAULT FALSE,
      score INT,
      ip TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ideas ADD COLUMN IF NOT EXISTS numero TEXT;
    ALTER TABLE ideas ALTER COLUMN nome SET DEFAULT '';
    ALTER TABLE ideas ALTER COLUMN sobrenome SET DEFAULT '';
    ALTER TABLE ideas ALTER COLUMN email SET DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
    CREATE INDEX IF NOT EXISTS idx_ideas_tese ON ideas(tese_slug);
    CREATE INDEX IF NOT EXISTS idx_ideas_numero ON ideas(numero);
    CREATE TABLE IF NOT EXISTS access_log (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'admin',
      acao TEXT NOT NULL,
      alvo TEXT,
      ip TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS modalidades (
      id SERIAL PRIMARY KEY,
      nome TEXT UNIQUE NOT NULL,
      ordem INT NOT NULL DEFAULT 0
    );
  `);

  // event singleton
  await query(`INSERT INTO event (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);

  // seed teses/soluções apenas se vazio
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM teses;');
  if (rows[0].n === 0) {
    for (let i = 0; i < SEED_TESES.length; i++) {
      const t = SEED_TESES[i];
      const r = await query(
        'INSERT INTO teses (slug, nome, cor, ordem, ativa) VALUES ($1,$2,$3,$4,TRUE) RETURNING id;',
        [t.slug, t.nome, t.cor, i]
      );
      const teseId = r.rows[0].id;
      for (let j = 0; j < t.solucoes.length; j++) {
        await query('INSERT INTO solucoes (tese_id, texto, ordem, ativa) VALUES ($1,$2,$3,TRUE);',
          [teseId, t.solucoes[j], j]);
      }
    }
    console.log('[db] Seed de teses e soluções criado.');
  } else if (process.env.RESEED_CONTENT === '1') {
    // Refresh de conteúdo (nomes, cores e soluções) sem apagar participações.
    // Ativar setando RESEED_CONTENT=1 no Render; remover a variável depois de aplicar.
    for (let i = 0; i < SEED_TESES.length; i++) {
      const t = SEED_TESES[i];
      const up = await query(
        `INSERT INTO teses (slug, nome, cor, ordem, ativa) VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (slug) DO UPDATE SET nome=EXCLUDED.nome, cor=EXCLUDED.cor, ordem=EXCLUDED.ordem, ativa=TRUE
         RETURNING id;`,
        [t.slug, t.nome, t.cor, i]
      );
      const teseId = up.rows[0].id;
      await query('DELETE FROM solucoes WHERE tese_id=$1;', [teseId]);
      for (let j = 0; j < t.solucoes.length; j++) {
        await query('INSERT INTO solucoes (tese_id, texto, ordem, ativa) VALUES ($1,$2,$3,TRUE);',
          [teseId, t.solucoes[j], j]);
      }
    }
    console.log('[db] Conteúdo (temas/soluções) atualizado via RESEED_CONTENT.');
  }

  const md = await query('SELECT COUNT(*)::int AS n FROM modalidades;');
  if (md.rows[0].n === 0) {
    for (let i = 0; i < MODALIDADES.length; i++) {
      await query('INSERT INTO modalidades (nome, ordem) VALUES ($1,$2) ON CONFLICT (nome) DO NOTHING;', [MODALIDADES[i], i]);
    }
  }
  console.log('[db] Schema pronto.');
}
