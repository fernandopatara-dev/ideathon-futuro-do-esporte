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
  { slug: 'fas', nome: 'Engajamento com fãs', cor: '#FF5A36', solucoes: [
    'App que deixa a torcida escolher a música de entrada',
    'Ingresso mais barato para quem vem de transporte público',
    'Torcida vota quem dá a entrevista pós-jogo',
    'Card colecionável digital que pontua a cada ida ao estádio',
    'Liga de várzea com transmissão e figurinhas',
    'Museu virtual do clube montado com fotos da torcida',
    'Programa "primeira vez no estádio" para crianças',
    'Enquete ao vivo que muda o show do intervalo',
    'Sócio-torcedor jovem com benefício na escola',
    'Mural digital de recados da torcida para o time' ] },
  { slug: 'perf', nome: 'Performance humana', cor: '#14A89A', solucoes: [
    'Sensor no tênis que avisa risco de lesão',
    'Treino por IA para quem não tem técnico',
    'Colete que mede hidratação e lembra de beber',
    'Óculos que mostram padrões do adversário',
    'App de sono e recuperação para atleta estudante',
    'Fisioterapia por vídeo para atleta do interior',
    'Análise de vídeo do celular corrige o gesto',
    'Plano nutricional acessível para a base',
    'Pulseira que evita overtraining',
    'Mentoria de atleta profissional para jovem da quebrada' ] },
  { slug: 'midia', nome: 'Mídia e entretenimento', cor: '#F2C14E', solucoes: [
    'Transmissão em que você escolhe a câmera',
    'Narração feita por jovens da comunidade',
    'Cortes de 3 min sobre atletas paralímpicos',
    'Realidade aumentada que replica lances em casa',
    'Reprise dos melhores lances em Libras',
    'Podcast feito pelos próprios atletas da base',
    'Bastidores ao vivo do vestiário',
    'Figurinhas em vídeo dos lances do campeonato',
    'Comentarista por IA que explica a regra na hora',
    'Plataforma de clipes que remunera quem cria' ] },
  { slug: 'gestao', nome: 'Gestão e regras', cor: '#7C9CF5', solucoes: [
    'Cartão verde para quem ajuda adversário caído',
    'Metade da comissão técnica com mulheres',
    'Tempo parado de verdade, sem cera',
    'Árbitro explica a decisão no telão',
    'Adolescente com voto no conselho do clube',
    'Finanças do clube abertas num app',
    'Punição maior para racismo na arquibancada',
    'Cotas de base para escola pública',
    'Regras iguais no esporte feminino e masculino',
    'Fair play julgado pela própria torcida' ] },
  { slug: 'sust', nome: 'Sustentabilidade', cor: '#5CC46B', solucoes: [
    'Uniformes de garrafa PET recolhida no estádio',
    'Refletor que só liga com gente na arquibancada',
    'Copos retornáveis com cashback',
    'Uma árvore plantada por gol marcado',
    'Placar do CO2 economizado por quem veio a pé',
    'Energia solar cobrindo o telhado da arena',
    'Água da chuva reaproveitada no gramado',
    'Transporte coletivo grátis no dia de jogo',
    'Coleta seletiva gamificada na saída',
    'Camisa reciclada vira nova camisa' ] },
  { slug: 'prod', nome: 'Produtos inteligentes', cor: '#E27BD1', solucoes: [
    'Bola que conta passes certos no celular',
    'Chuteira que se ajusta sozinha ao pé',
    'Prancha que grava a onda e monta o vídeo',
    'Rede de vôlei que apita ao toque',
    'Pulseira que vira placar de energia da torcida',
    'Camisa que mostra os batimentos do jogador',
    'Apito eletrônico que registra toda falta',
    'Trave com sensor de gol automático',
    'Tornozeleira que mede a explosão do salto',
    'App que vira qualquer quadra em quadra oficial' ] },
  { slug: 'arenas', nome: 'Arenas inteligentes', cor: '#4FC3F7', solucoes: [
    'Tradução do que o técnico grita para a torcida',
    'Cadeira que vibra com a batida da torcida',
    'Quadra pública que acende ao chegar alguém',
    'Estádio que vira cinema e escola sem jogo',
    'Fila zero: lanche pelo app chega na cadeira',
    'Espaço para cadeirante em todos os setores',
    'Wi-Fi com replay instantâneo na mão',
    'Vestiário com projeto social do bairro',
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
      nome TEXT NOT NULL,
      sobrenome TEXT NOT NULL,
      email TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
    CREATE INDEX IF NOT EXISTS idx_ideas_tese ON ideas(tese_slug);
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
  }

  const md = await query('SELECT COUNT(*)::int AS n FROM modalidades;');
  if (md.rows[0].n === 0) {
    for (let i = 0; i < MODALIDADES.length; i++) {
      await query('INSERT INTO modalidades (nome, ordem) VALUES ($1,$2) ON CONFLICT (nome) DO NOTHING;', [MODALIDADES[i], i]);
    }
  }
  console.log('[db] Schema pronto.');
}
