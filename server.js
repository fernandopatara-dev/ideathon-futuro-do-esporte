// server.js — Express: páginas estáticas + API pública + API admin.
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query, initSchema } from './db.js';
import { moderate, checkNome } from './moderation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'arena2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-este-segredo';
const COOKIE = 'ideathon_admin';

// ---------- util ----------
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const exp = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig !== exp) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('='); if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function requireAdmin(req, res, next) {
  const t = parseCookies(req)[COOKIE];
  const p = verify(t);
  if (!p || p.role !== 'admin') return res.status(401).json({ error: 'não autorizado' });
  req.admin = p;
  next();
}
async function logAcao(usuario, acao, alvo, ip, papel = 'admin') {
  try { await query('INSERT INTO access_log (usuario, papel, acao, alvo, ip) VALUES ($1,$2,$3,$4,$5);', [usuario, papel, acao, alvo, ip]); } catch (e) { /* noop */ }
}

async function teseMap() {
  const t = await query('SELECT id, slug, nome, cor, ordem, ativa FROM teses ORDER BY ordem, id;');
  const s = await query('SELECT id, tese_id, texto, ordem, ativa FROM solucoes ORDER BY ordem, id;');
  const byId = {};
  const teses = t.rows.map((row) => ({ ...row, solucoes: [] }));
  teses.forEach((tt) => { byId[tt.id] = tt; });
  s.rows.forEach((sol) => { if (byId[sol.tese_id]) byId[sol.tese_id].solucoes.push(sol); });
  return teses;
}

// ==================== API PÚBLICA ====================

// Config pública (event + teses ativas + soluções ativas)
app.get('/api/config', async (req, res) => {
  try {
    const ev = (await query('SELECT nome, subtitulo, aberto, max_frase FROM event WHERE id=1;')).rows[0];
    const teses = (await teseMap())
      .filter((t) => t.ativa)
      .map((t) => ({ slug: t.slug, nome: t.nome, cor: t.cor,
        solucoes: t.solucoes.filter((s) => s.ativa).map((s) => ({ id: s.id, texto: s.texto })) }));
    const modalidades = (await query('SELECT nome FROM modalidades ORDER BY ordem, id;')).rows.map((r) => r.nome);
    res.json({ event: ev, teses, modalidades });
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

// Envio de ideia (público)
app.post('/api/ideas', async (req, res) => {
  try {
    const ev = (await query('SELECT aberto, moderacao_ia, max_frase FROM event WHERE id=1;')).rows[0];
    if (!ev || !ev.aberto) return res.status(403).json({ error: 'As inscrições estão encerradas.' });

    let { nome, sobrenome, email, modalidade, tese, picks, frase } = req.body || {};
    nome = (nome || '').trim(); sobrenome = (sobrenome || '').trim();
    email = (email || '').trim(); frase = (frase || '').trim();
    modalidade = (modalidade || '').trim();

    if (nome.length < 2) return res.status(400).json({ error: 'Escreva seu nome.' });
    if (sobrenome.length < 2) return res.status(400).json({ error: 'Escreva seu sobrenome.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (checkNome(nome + ' ' + sobrenome)) return res.status(400).json({ error: 'Esse nome não pode ser usado.' });
    if (frase.length < 12) return res.status(400).json({ error: 'Conte um pouco mais sobre a sua ideia.' });
    if (frase.length > (ev.max_frase || 190)) return res.status(400).json({ error: `A frase passa de ${ev.max_frase} caracteres.` });

    // tese válida
    const teseRow = (await query('SELECT id, slug FROM teses WHERE slug=$1 AND ativa=TRUE;', [tese])).rows[0];
    if (!teseRow) return res.status(400).json({ error: 'Tese inválida.' });

    // picks: exatamente 3, pertencentes à tese
    if (!Array.isArray(picks) || picks.length !== 3) return res.status(400).json({ error: 'Escolha exatamente 3 soluções.' });
    picks = picks.map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n));
    const valid = (await query('SELECT id FROM solucoes WHERE tese_id=$1 AND ativa=TRUE AND id = ANY($2::int[]);', [teseRow.id, picks])).rows.map((r) => r.id);
    if (valid.length !== 3) return res.status(400).json({ error: 'Soluções inválidas para essa tese.' });

    // dedup: uma resposta por pessoa (nome+sobrenome+email) e por e-mail
    const personKey = sha(norm(nome) + '|' + norm(sobrenome) + '|' + norm(email));
    const emailKey = sha(norm(email));
    const dup = (await query('SELECT 1 FROM ideas WHERE person_key=$1 OR email_key=$2 LIMIT 1;', [personKey, emailKey])).rowCount;
    if (dup) return res.status(409).json({ error: 'Você já enviou sua resposta. Cada pessoa participa uma única vez.' });

    // moderação
    const mod = await moderate(frase, { moderacaoIA: ev.moderacao_ia });
    if (mod.status === 'bloqueada') {
      return res.status(422).json({ error: mod.motivo, agente: mod.resultado, blocked: true });
    }

    const ip = ipOf(req);
    let inserted;
    try {
      inserted = await query(
        `INSERT INTO ideas (person_key, email_key, nome, sobrenome, email, modalidade, tese_slug, picks, frase, status, agente_resultado, agente_motivo, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, status;`,
        [personKey, emailKey, nome, sobrenome, email, modalidade, teseRow.slug, picks, frase, mod.status, mod.resultado, mod.motivo, ip]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Você já enviou sua resposta. Cada pessoa participa uma única vez.' });
      throw e;
    }
    const row = inserted.rows[0];
    res.json({ ok: true, id: row.id, status: row.status,
      pendente: row.status === 'pendente',
      picksTextos: (await query('SELECT texto FROM solucoes WHERE id = ANY($1::int[]) ORDER BY ordem;', [picks])).rows.map((r) => r.texto) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao enviar. Tente de novo.' }); }
});

// Dados do telão (público) — agregados
app.get('/api/telao', async (req, res) => {
  try {
    const ev = (await query('SELECT nome, subtitulo FROM event WHERE id=1;')).rows[0];
    const totalPart = (await query("SELECT COUNT(*)::int AS n FROM ideas;")).rows[0].n;
    const totalApr = (await query("SELECT COUNT(*)::int AS n FROM ideas WHERE status='aprovada';")).rows[0].n;

    const porTese = (await query(`
      SELECT t.slug, t.nome, t.cor, COUNT(i.*)::int AS n
      FROM teses t LEFT JOIN ideas i ON i.tese_slug=t.slug AND i.status='aprovada'
      WHERE t.ativa=TRUE GROUP BY t.slug,t.nome,t.cor,t.ordem ORDER BY n DESC, t.ordem;`)).rows;

    const solucoes = (await query(`
      SELECT s.id, s.texto, t.slug, t.cor, COUNT(*)::int AS votos
      FROM ideas i, unnest(i.picks) pid
      JOIN solucoes s ON s.id = pid
      JOIN teses t ON t.id = s.tese_id
      WHERE i.status='aprovada'
      GROUP BY s.id, s.texto, t.slug, t.cor
      ORDER BY votos DESC LIMIT 40;`)).rows;

    const totalVotos = solucoes.reduce((a, s) => a + s.votos, 0);
    const recentes = (await query(`SELECT nome, frase, tese_slug FROM ideas WHERE status='aprovada' ORDER BY criado_em DESC LIMIT 8;`)).rows;

    res.json({ event: ev, totalPart, totalApr, totalVotos, porTese, solucoes, recentes });
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

// ==================== AUTENTICAÇÃO ADMIN ====================
app.post('/api/admin/login', async (req, res) => {
  const { senha } = req.body || {};
  if (!senha || senha !== ADMIN_PASSWORD) {
    await logAcao('desconhecido', 'Tentativa de login falhou', null, ipOf(req));
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  const token = sign({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 12 });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  await logAcao('admin', 'Login no painel', null, ipOf(req));
  res.json({ ok: true });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});
app.get('/api/admin/me', (req, res) => {
  const p = verify(parseCookies(req)[COOKIE]);
  res.json({ admin: !!(p && p.role === 'admin') });
});

// ==================== API ADMIN ====================
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    const r = (await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='aprovada')::int AS aprovadas,
        COUNT(*) FILTER (WHERE status='pendente')::int AS pendentes,
        COUNT(*) FILTER (WHERE status='bloqueada')::int AS bloqueadas,
        COUNT(*) FILTER (WHERE selecionada)::int AS selecionadas
      FROM ideas;`)).rows[0];
    const ev = (await query('SELECT nome, subtitulo, aberto, moderacao_ia, max_frase FROM event WHERE id=1;')).rows[0];
    res.json({ stats: r, event: ev, iaConfigurada: !!process.env.ANTHROPIC_API_KEY });
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

app.get('/api/admin/ideas', requireAdmin, async (req, res) => {
  try {
    const { status, tese, q } = req.query;
    const cond = []; const params = [];
    if (status) { params.push(status); cond.push(`status=$${params.length}`); }
    if (tese) { params.push(tese); cond.push(`tese_slug=$${params.length}`); }
    if (q) { params.push('%' + q.toLowerCase() + '%'); cond.push(`(lower(nome||' '||sobrenome) LIKE $${params.length} OR lower(email) LIKE $${params.length} OR lower(frase) LIKE $${params.length})`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const rows = (await query(`
      SELECT i.id, i.nome, i.sobrenome, i.email, i.modalidade, i.tese_slug, i.frase, i.status,
             i.agente_resultado, i.agente_motivo, i.selecionada, i.score, i.criado_em,
             COALESCE((SELECT array_agg(s.texto ORDER BY s.ordem) FROM solucoes s WHERE s.id = ANY(i.picks)), '{}') AS picks_textos
      FROM ideas i ${where} ORDER BY i.criado_em DESC LIMIT 2000;`, params)).rows;
    res.json({ ideas: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

app.post('/api/admin/ideas/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, selecionada, score } = req.body || {};
    const sets = []; const params = []; const acoes = [];
    if (status && ['aprovada', 'pendente', 'bloqueada'].includes(status)) {
      params.push(status); sets.push(`status=$${params.length}`);
      params.push('Humano: ' + status); sets.push(`agente_resultado=$${params.length}`);
      acoes.push(status === 'aprovada' ? 'Aprovou' : status === 'bloqueada' ? 'Bloqueou' : 'Marcou pendente');
    }
    if (typeof selecionada === 'boolean') { params.push(selecionada); sets.push(`selecionada=$${params.length}`); acoes.push(selecionada ? 'Selecionou p/ pitch' : 'Removeu da seleção'); }
    if (score === null || Number.isInteger(score)) { params.push(score); sets.push(`score=$${params.length}`); if (Number.isInteger(score)) acoes.push('Deu nota ' + score); }
    if (!sets.length) return res.status(400).json({ error: 'nada a atualizar' });
    params.push(id);
    await query(`UPDATE ideas SET ${sets.join(', ')} WHERE id=$${params.length};`, params);
    await logAcao('admin', acoes.join(' / ') + ' ideia #' + String(id).padStart(4, '0'), 'idea:' + id, ipOf(req));
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

// Edição de teses e soluções
app.get('/api/admin/teses', requireAdmin, async (req, res) => {
  try { res.json({ teses: await teseMap() }); } catch (e) { res.status(500).json({ error: 'erro' }); }
});
app.post('/api/admin/teses', requireAdmin, async (req, res) => {
  try {
    const { nome, slug, cor } = req.body || {};
    if (!nome || !slug) return res.status(400).json({ error: 'nome e slug obrigatórios' });
    const ordem = (await query('SELECT COALESCE(MAX(ordem),-1)+1 AS o FROM teses;')).rows[0].o;
    const r = await query('INSERT INTO teses (slug, nome, cor, ordem, ativa) VALUES ($1,$2,$3,$4,TRUE) RETURNING id;', [slug, nome, cor || '#FF5A36', ordem]);
    await logAcao('admin', 'Criou tese ' + nome, 'tese:' + r.rows[0].id, ipOf(req));
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'slug já existe' }); res.status(500).json({ error: 'erro' }); }
});
app.put('/api/admin/teses/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nome, cor, ativa } = req.body || {};
    const sets = []; const params = [];
    if (nome !== undefined) { params.push(nome); sets.push(`nome=$${params.length}`); }
    if (cor !== undefined) { params.push(cor); sets.push(`cor=$${params.length}`); }
    if (typeof ativa === 'boolean') { params.push(ativa); sets.push(`ativa=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nada' });
    params.push(id);
    await query(`UPDATE teses SET ${sets.join(', ')} WHERE id=$${params.length};`, params);
    await logAcao('admin', 'Editou tese #' + id, 'tese:' + id, ipOf(req));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'erro' }); }
});
app.delete('/api/admin/teses/:id', requireAdmin, async (req, res) => {
  try { const id = parseInt(req.params.id, 10); await query('DELETE FROM teses WHERE id=$1;', [id]); await logAcao('admin', 'Excluiu tese #' + id, 'tese:' + id, ipOf(req)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'erro' }); }
});
app.post('/api/admin/teses/:id/solucoes', requireAdmin, async (req, res) => {
  try {
    const teseId = parseInt(req.params.id, 10);
    const { texto } = req.body || {};
    if (!texto || texto.trim().length < 3) return res.status(400).json({ error: 'texto muito curto' });
    const ordem = (await query('SELECT COALESCE(MAX(ordem),-1)+1 AS o FROM solucoes WHERE tese_id=$1;', [teseId])).rows[0].o;
    const r = await query('INSERT INTO solucoes (tese_id, texto, ordem, ativa) VALUES ($1,$2,$3,TRUE) RETURNING id;', [teseId, texto.trim(), ordem]);
    await logAcao('admin', 'Adicionou solução na tese #' + teseId, 'solucao:' + r.rows[0].id, ipOf(req));
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: 'erro' }); }
});
app.put('/api/admin/solucoes/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { texto, ativa } = req.body || {};
    const sets = []; const params = [];
    if (texto !== undefined) { params.push(texto); sets.push(`texto=$${params.length}`); }
    if (typeof ativa === 'boolean') { params.push(ativa); sets.push(`ativa=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nada' });
    params.push(id);
    await query(`UPDATE solucoes SET ${sets.join(', ')} WHERE id=$${params.length};`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'erro' }); }
});
app.delete('/api/admin/solucoes/:id', requireAdmin, async (req, res) => {
  try { const id = parseInt(req.params.id, 10); await query('DELETE FROM solucoes WHERE id=$1;', [id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'erro' }); }
});

// Configurações do evento
app.put('/api/admin/event', requireAdmin, async (req, res) => {
  try {
    const { nome, subtitulo, aberto, moderacao_ia, max_frase } = req.body || {};
    const sets = []; const params = [];
    if (nome !== undefined) { params.push(nome); sets.push(`nome=$${params.length}`); }
    if (subtitulo !== undefined) { params.push(subtitulo); sets.push(`subtitulo=$${params.length}`); }
    if (typeof aberto === 'boolean') { params.push(aberto); sets.push(`aberto=$${params.length}`); }
    if (typeof moderacao_ia === 'boolean') { params.push(moderacao_ia); sets.push(`moderacao_ia=$${params.length}`); }
    if (Number.isInteger(max_frase)) { params.push(max_frase); sets.push(`max_frase=$${params.length}`); }
    sets.push('atualizado_em=now()');
    await query(`UPDATE event SET ${sets.join(', ')} WHERE id=1;`, params);
    await logAcao('admin', 'Atualizou configurações do evento', null, ipOf(req));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'erro' }); }
});

// Exportação CSV
app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  try {
    const rows = (await query(`
      SELECT i.id, i.criado_em, i.nome, i.sobrenome, i.email, i.modalidade, i.tese_slug, i.status,
             i.selecionada, i.score, i.frase,
             COALESCE((SELECT string_agg(s.texto, ' | ' ORDER BY s.ordem) FROM solucoes s WHERE s.id = ANY(i.picks)), '') AS solucoes
      FROM ideas i ORDER BY i.criado_em DESC;`)).rows;
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['id','criado_em','nome','sobrenome','email','modalidade','tese','status','selecionada','score','frase','solucoes'];
    const csv = [head.join(',')].concat(rows.map((r) => [r.id, r.criado_em, r.nome, r.sobrenome, r.email, r.modalidade, r.tese_slug, r.status, r.selecionada, r.score, r.frase, r.solucoes].map(esc).join(','))).join('\n');
    await logAcao('admin', 'Exportou CSV (' + rows.length + ' registros)', null, ipOf(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ideathon-ideias.csv"');
    res.send('﻿' + csv);
  } catch (e) { console.error(e); res.status(500).json({ error: 'erro' }); }
});

// Log de acessos
app.get('/api/admin/log', requireAdmin, async (req, res) => {
  try {
    const rows = (await query('SELECT usuario, papel, acao, alvo, ip, criado_em FROM access_log ORDER BY criado_em DESC LIMIT 500;')).rows;
    res.json({ log: rows });
  } catch (e) { res.status(500).json({ error: 'erro' }); }
});

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => app.listen(PORT, () => console.log('[server] no ar em http://localhost:' + PORT)))
  .catch((e) => { console.error('[server] falha ao iniciar schema:', e); process.exit(1); });
