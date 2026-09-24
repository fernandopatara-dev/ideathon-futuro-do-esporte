// moderation.js — Agente de moderação próprio da Arena Hub.
// Camada 1: lista de termos não permitidos (instantânea, no servidor).
// Camada 2: IA (Anthropic) classificando ofensa / discurso de ódio / nome de pessoa.
// Se a IA não estiver configurada (sem ANTHROPIC_API_KEY), aplica só a camada 1.

const BAD = ['merda','porra','caralho','idiota','burro','otario','otária','lixo','fdp','bosta','viado','viada',
  'puta','puto','imbecil','cuzao','cuzão','arrombado','arrombada','desgraca','desgraça','corno','vagabundo',
  'vagabunda','retardado','retardada','babaca','escroto','escrota','piranha','buceta','pau no cu','vai se fuder',
  'vsf','krl','caralio','merdinha'];
const HATE = ['macaco','crioulo','preto safado','viadinho','sapatao','sapatão','traveco','morra','odeio voces',
  'odeio vocês','nazista','hitler','estupro','estuprar','matar todos'];

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function listHit(text) {
  const n = norm(text);
  const words = new Set(n.split(' '));
  for (const w of BAD) {
    const wn = norm(w);
    if (wn.includes(' ') ? n.includes(wn) : words.has(wn)) return { tipo: 'ofensa', termo: w };
  }
  for (const w of HATE) {
    const wn = norm(w);
    if (wn.includes(' ') ? n.includes(wn) : words.has(wn)) return { tipo: 'discurso de ódio', termo: w };
  }
  return null;
}

async function askAI(frase) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null; // IA não configurada
  const model = process.env.MOD_MODEL || 'claude-3-5-haiku-latest';
  const prompt = `Você é o agente de moderação de um ideathon para JOVENS E ADOLESCENTES sobre o futuro do esporte.
Avalie a frase enviada por um participante (em português do Brasil) e decida se pode aparecer num telão público.

Bloqueie (decisao "bloquear") se houver: xingamento, palavrão, ofensa, discurso de ódio (racismo, homofobia, machismo, etc.),
conteúdo sexual, ameaça, ou dados sensíveis de terceiros.
Envie para revisão humana (decisao "revisar") se: citar o NOME DE UMA PESSOA REAL (jogador, colega, professor, político, celebridade),
citar marca de forma ofensiva, ou algo ambíguo que mereça olhar humano.
Aprove (decisao "aprovar") se for uma ideia construtiva e adequada.

Responda SOMENTE com um JSON: {"decisao":"aprovar|revisar|bloquear","tipo":"ok|ofensa|odio|nome|sexual|ameaca|dados|outro","motivo":"curto, amigável, em português"}

Frase: """${(frase || '').slice(0, 1000)}"""`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.warn('[moderation] IA HTTP', resp.status);
      return { error: true };
    }
    const data = await resp.json();
    const txt = (data.content && data.content[0] && data.content[0].text) || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { error: true };
    const j = JSON.parse(m[0]);
    return {
      decisao: ['aprovar', 'revisar', 'bloquear'].includes(j.decisao) ? j.decisao : 'revisar',
      tipo: j.tipo || 'outro',
      motivo: (j.motivo || '').slice(0, 240),
    };
  } catch (e) {
    console.warn('[moderation] IA erro:', e.message);
    return { error: true };
  }
}

// Retorna { status, resultado, motivo }
// status: 'aprovada' | 'pendente' | 'bloqueada'
export async function moderate(frase, { moderacaoIA = true } = {}) {
  const hit = listHit(frase);
  if (hit) {
    return {
      status: 'bloqueada',
      resultado: 'Lista: bloqueada (' + hit.tipo + ')',
      motivo: 'Opa, essa palavra não pode ir para o telão. Reescreva a ideia sem ela.',
    };
  }
  if (!moderacaoIA) {
    return { status: 'aprovada', resultado: 'Lista: ok (IA desligada)', motivo: 'IA desligada nas configurações' };
  }
  const ai = await askAI(frase);
  if (ai === null) {
    return { status: 'aprovada', resultado: 'Lista: ok (IA não configurada)', motivo: 'Sem chave de IA' };
  }
  if (ai.error) {
    return { status: 'pendente', resultado: 'Agente: IA indisponível — revisar', motivo: 'Falha ao consultar a IA; enviado para revisão humana' };
  }
  if (ai.decisao === 'bloquear') {
    return { status: 'bloqueada', resultado: 'Agente: bloqueada (' + ai.tipo + ')', motivo: ai.motivo || 'Conteúdo não permitido' };
  }
  if (ai.decisao === 'revisar') {
    return { status: 'pendente', resultado: 'Agente: revisar (' + ai.tipo + ')', motivo: ai.motivo || 'Enviado para revisão humana' };
  }
  return { status: 'aprovada', resultado: 'Agente: aprovada', motivo: ai.motivo || 'Sem ofensas, sem nomes' };
}

// Verificação leve de nome/ofensa no NOME do participante (só camada lista)
export function checkNome(nome) {
  return listHit(nome);
}
