// moderation.js — Agente de moderação próprio da Arena Hub.
// 3 camadas:
//  1) Lista de termos (instantânea): palavrões, ofensas, sexual e ódio -> BLOQUEIA na hora.
//  2) Lista de animais (instantânea): menção a animal -> REVISÃO humana (não bloqueia direto).
//  3) IA (Anthropic): ofensa velada, racismo/homofobia de contexto, sexual implícito e
//     NOMES PRÓPRIOS de pessoas -> bloquear / revisar / aprovar.
// Política: só frases claramente OK entram sozinhas no telão; nome/animal/ambíguo vão para revisão.

// --- Camada 1: bloqueio imediato ---
const BAD = [
  // palavrões / ofensas
  'merda','porra','caralho','caralio','idiota','burro','burra','otario','otaria','otário','otária',
  'lixo','fdp','filho da puta','filha da puta','bosta','puta','puto','imbecil','cuzao','cuzão',
  'arrombado','arrombada','desgraca','desgraça','corno','corna','vagabundo','vagabunda',
  'retardado','retardada','babaca','escroto','escrota','piranha','buceta','pau no cu',
  'vai se fuder','vai tomar no cu','vsf','vtnc','krl','merdinha','trouxa','mongoloide','mongol',
  'panaca','cretino','canalha','lesado','tapado','estupido','estúpido','estupida','estúpida',
  'anta','jumento','jega','jegue','nojento','nojenta','lazarento','palhaço de merda',
  // sexual explícito
  'sexo','transar','transa','pelado','pelada','nudes','penis','pênis','pinto','rola','piru',
  'xota','xoxota','boquete','gozar','gozada','tesao','tesão','punheta','siririca','foder','fuder',
  'trepar','orgia','putaria','masturbar','masturba','pornografia','porno','porn','caralhada',
];
const HATE = [
  // racismo
  'macaco','macaca','crioulo','crioula','preto safado','preta safada','volta pra senzala','senzala',
  // homofobia / transfobia
  'viado','viada','viadinho','bicha','boiola','baitola','sapatao','sapatão','sapatona','traveco','traveca',
  // ódio / ameaça
  'nazista','nazismo','hitler','heil','supremacia branca','morra','morte aos','matar todos',
  'estupro','estuprar','limpeza etnica','limpeza étnica','xenofobo','xenófobo',
];

// --- Camada 2: menção a animal -> revisão humana ---
const ANIMAIS = [
  'vaca','porco','porca','cachorro','cachorra','cadela','mula','cavalo','egua','égua','boi','vaca leiteira',
  'galinha','galo','frango','rato','ratazana','barata','cobra','urubu','gamba','gambá','bode','cabra',
  'jacare','jacaré','capivara','lagarto','sapo','mosca','mosquito','piolho','verme','lesma','burro de carga',
];

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchList(n, words, list) {
  for (const w of list) {
    const wn = norm(w);
    if (wn.includes(' ') ? n.includes(wn) : words.has(wn)) return w;
  }
  return null;
}

function listHit(text) {
  const n = norm(text);
  const words = new Set(n.split(' '));
  let t = matchList(n, words, HATE);
  if (t) return { acao: 'bloquear', tipo: 'discurso de ódio', termo: t };
  t = matchList(n, words, BAD);
  if (t) return { acao: 'bloquear', tipo: 'ofensa', termo: t };
  t = matchList(n, words, ANIMAIS);
  if (t) return { acao: 'revisar', tipo: 'menção a animal', termo: t };
  return null;
}

async function askAI(frase) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null; // IA não configurada
  const model = process.env.MOD_MODEL || 'claude-3-5-haiku-latest';
  const prompt = `Você é o agente de moderação de um ideathon para JOVENS E ADOLESCENTES sobre o futuro do esporte.
Avalie a frase enviada por um participante (português do Brasil) e decida se pode aparecer num TELÃO PÚBLICO, com plateia e imprensa.

BLOQUEAR (decisao "bloquear") se houver qualquer: xingamento, palavrão, ofensa, discurso de ódio
(racismo, homofobia, transfobia, machismo, xenofobia, capacitismo), conteúdo sexual (explícito ou implícito),
ameaça ou incitação à violência, ou dados sensíveis de terceiros. Considere também ofensas DISFARÇADAS,
com trocadilho, ironia ou grafia alterada.

REVISAR (decisao "revisar") se: a frase citar o NOME PRÓPRIO DE UMA PESSOA REAL
(jogador, colega, professor, político, celebridade, treinador), citar o NOME DE UM ANIMAL,
citar uma marca/clube de forma pejorativa, ou for ambígua a ponto de merecer olhar humano.

APROVAR (decisao "aprovar") somente se for uma ideia construtiva, adequada, sem nenhum dos itens acima.

Responda SOMENTE com JSON válido:
{"decisao":"aprovar|revisar|bloquear","tipo":"ok|ofensa|odio|sexual|ameaca|nome|animal|marca|dados|outro","motivo":"curto, amigável, em português, falando com um adolescente"}

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
  // Camada 1 e 2 (instantâneas)
  const hit = listHit(frase);
  if (hit && hit.acao === 'bloquear') {
    return {
      status: 'bloqueada',
      resultado: 'Lista: bloqueada (' + hit.tipo + ')',
      motivo: 'Opa! Essa ideia tem uma palavra que não pode ir ao telão. Reescreve sem ela? 😉',
    };
  }
  // menção a animal pela lista -> guarda para revisão, mas ainda deixa a IA avaliar o resto
  const listaRevisar = hit && hit.acao === 'revisar' ? hit : null;

  // Camada 3 (IA)
  if (moderacaoIA) {
    const ai = await askAI(frase);
    if (ai && !ai.error) {
      if (ai.decisao === 'bloquear') {
        return { status: 'bloqueada', resultado: 'Agente: bloqueada (' + ai.tipo + ')', motivo: ai.motivo || 'Conteúdo não permitido no telão.' };
      }
      if (ai.decisao === 'revisar') {
        return { status: 'pendente', resultado: 'Agente: revisar (' + ai.tipo + ')', motivo: ai.motivo || 'Enviado para revisão humana.' };
      }
      // IA aprovou — mas se a lista marcou animal, prevalece a revisão humana
      if (listaRevisar) {
        return { status: 'pendente', resultado: 'Lista: revisar (' + listaRevisar.tipo + ')', motivo: 'Citou um animal — enviado para revisão humana.' };
      }
      return { status: 'aprovada', resultado: 'Agente: aprovada', motivo: ai.motivo || 'Sem ofensas, sem nomes.' };
    }
    if (ai && ai.error) {
      // IA indisponível: por segurança, vai para revisão
      return { status: 'pendente', resultado: 'Agente: IA indisponível — revisar', motivo: 'Não consegui consultar a IA agora; enviado para revisão humana.' };
    }
    // ai === null -> IA não configurada (sem chave): cai para a regra da lista abaixo
  }

  // IA desligada ou não configurada: decide só pela lista
  if (listaRevisar) {
    return { status: 'pendente', resultado: 'Lista: revisar (' + listaRevisar.tipo + ')', motivo: 'Citou um animal — enviado para revisão humana.' };
  }
  const motivoBase = moderacaoIA ? 'Sem chave de IA — aprovado só pela lista.' : 'IA desligada nas configurações.';
  return { status: 'aprovada', resultado: 'Lista: ok', motivo: motivoBase };
}

// Verificação leve de ofensa/ódio no texto (ex.: nome do participante) — só camada lista
export function checkNome(nome) {
  const h = listHit(nome);
  return h && h.acao === 'bloquear' ? { tipo: h.tipo, termo: h.termo } : null;
}
