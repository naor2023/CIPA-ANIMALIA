const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const os = require('node:os');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const QRCode = require('qrcode');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { rateLimit } = require('express-rate-limit');
const db = require('./db');
const PostgresSessionStore = require('./session-store');
const storage = require('./storage');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = ['Sugestão', 'Reclamação', 'Relato de risco', 'Melhoria de segurança', 'Condição insegura', 'Elogio', 'Outro'];
const STATUSES = ['Novo', 'Em análise', 'Em andamento', 'Resolvido', 'Arquivado'];
const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Crítica'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, done) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) return done(null, true);
    const error = new Error('Formato de imagem não suportado.');
    error.code = 'UNSUPPORTED_IMAGE';
    done(error);
  }
});

function getLanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue;
      addresses.push({ address: entry.address, virtual: /vethernet|virtual|docker|wsl|hyper-v|vmware/i.test(name) });
    }
  }
  return addresses.sort((a, b) => Number(a.virtual) - Number(b.virtual)).map(x => x.address);
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const clean = (value, max = 5000) => String(value || '').trim().slice(0, max);
const safeNext = (value) => String(value || '').startsWith('/admin') ? value : '/admin';
const auth = (req, res, next) => req.session.user ? next() : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);

function publicUrlFromRequest(req) {
  const configured = clean(process.env.PUBLIC_URL, 300);
  if (configured) return configured.replace(/\/+$/, '');
  const host = req.get('host');
  if (host?.includes('onrender.com')) return `https://${host}`;
  return `${req.protocol}://${host}`;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeDateTime(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '');
  return String(value).replace('T', ' ').replace('Z', '');
}

function normalizeRecord(record) {
  if (!record) return null;
  return { ...record, id: Number(record.id), created_at: normalizeDateTime(record.created_at), due_date: normalizeDate(record.due_date) };
}

async function ensureAdmin() {
  const username = process.env.ADMIN_USER || 'admincipa';
  const password = process.env.ADMIN_PASSWORD || 'Cipa@2027@';
  const user = await db.get('SELECT id FROM users WHERE username = $1', [username]);
  if (!user) await db.run('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, bcrypt.hashSync(password, 12)]);
}

async function addAudit(recordId, username, action, details = '', client = db) {
  await client.run('INSERT INTO audit_logs (record_id, username, action, details) VALUES ($1, $2, $3, $4)', [recordId, username, action, details]);
}

function filtersFrom(query) {
  return { from: clean(query.from, 10), to: clean(query.to, 10), department: clean(query.department, 120), type: clean(query.type, 50), status: clean(query.status, 30), priority: clean(query.priority, 20), q: clean(query.q, 150) };
}

function whereFor(filters, startIndex = 1) {
  const where = [], params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${startIndex + params.length - 1}`)); };
  if (filters.from) add('created_at::date >= ?::date', filters.from);
  if (filters.to) add('created_at::date <= ?::date', filters.to);
  if (filters.department) add('department = ?', filters.department);
  if (filters.type) add('type = ?', filters.type);
  if (filters.status) add('status = ?', filters.status);
  if (filters.priority) add('priority = ?', filters.priority);
  if (filters.q) {
    params.push(`%${filters.q}%`, `%${filters.q}%`);
    where.push(`(employee_name ILIKE $${startIndex + params.length - 2} OR description ILIKE $${startIndex + params.length - 1})`);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

async function getReportRecords(query) {
  const filters = filtersFrom(query), clause = whereFor(filters);
  const records = (await db.query(`SELECT * FROM records${clause.sql} ORDER BY id DESC`, clause.params)).map(normalizeRecord);
  const attachmentQuery = 'SELECT * FROM attachments WHERE record_id = $1 ORDER BY id';
  for (const record of records) record.attachments = await db.query(attachmentQuery, [record.id]);
  return { records, filters };
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  name: 'cipa.sid',
  store: new PostgresSessionStore(db),
  secret: process.env.SESSION_SECRET || 'cipa-animalia-altere-esta-chave-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 8 * 3600000 }
}));

const submissionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: 'Muitos envios realizados. Aguarde alguns minutos e tente novamente.' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.' });

app.get('/', (req, res) => res.render('public-form', { types: TYPES, success: req.query.success === '1', error: null, values: {} }));

app.post('/enviar', submissionLimiter, upload.fields([{ name: 'photos', maxCount: 3 }, { name: 'camera', maxCount: 1 }]), asyncRoute(async (req, res) => {
  const uploadedFiles = Object.values(req.files || {}).flat();
  const values = {
    employee_name: clean(req.body.employee_name, 150),
    department: clean(req.body.department, 120),
    job_title: clean(req.body.job_title, 120),
    type: clean(req.body.type, 50),
    description: clean(req.body.description, 5000)
  };
  if (!values.employee_name || !values.department || !TYPES.includes(values.type) || values.description.length < 10) {
    return res.status(400).render('public-form', { types: TYPES, success: false, error: 'Preencha os campos obrigatórios. A descrição deve ter pelo menos 10 caracteres.', values });
  }

  const storedFiles = [];
  try {
    for (const file of uploadedFiles) {
      storedFiles.push({ file, filename: await storage.uploadFile(file) });
    }
    await db.transaction(async (tx) => {
      const record = await tx.get(`INSERT INTO records (employee_name, department, job_title, type, description)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`, [values.employee_name, values.department, values.job_title, values.type, values.description]);
      for (const item of storedFiles) {
        await tx.run('INSERT INTO attachments (record_id, filename, original_name, mime_type) VALUES ($1, $2, $3, $4)',
          [record.id, item.filename, clean(item.file.originalname, 255), item.file.mimetype]);
      }
      await addAudit(record.id, 'Formulário público', 'Registro criado', `${values.type} - ${values.department}`, tx);
    });
    res.redirect('/?success=1');
  } catch (error) {
    await storage.removeFiles(storedFiles.map(file => file.filename)).catch(() => {});
    throw error;
  }
}));

app.get('/login', (req, res) => res.render('login', { error: null, next: safeNext(req.query.next) }));
app.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const username = clean(req.body.username, 80);
  const user = await db.get('SELECT * FROM users WHERE username = $1', [username]);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).render('login', { error: 'Usuário ou senha inválidos.', next: safeNext(req.body.next) });
  }
  req.session.regenerate((error) => {
    if (error) return res.status(500).send('Não foi possível iniciar a sessão.');
    req.session.user = { id: Number(user.id), username: user.username };
    res.redirect(safeNext(req.body.next));
  });
}));
app.post('/logout', auth, (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/admin', auth, asyncRoute(async (req, res) => {
  const filters = filtersFrom(req.query), clause = whereFor(filters);
  const [records, statsRows, departments, critical, overdue, total] = await Promise.all([
    db.query(`SELECT * FROM records${clause.sql} ORDER BY id DESC`, clause.params),
    db.query('SELECT status, COUNT(*)::int total FROM records GROUP BY status'),
    db.query("SELECT DISTINCT department FROM records WHERE department <> '' ORDER BY department"),
    db.get("SELECT COUNT(*)::int total FROM records WHERE priority='Crítica' AND status NOT IN ('Resolvido','Arquivado')"),
    db.get("SELECT COUNT(*)::int total FROM records WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status NOT IN ('Resolvido','Arquivado')"),
    db.get('SELECT COUNT(*)::int total FROM records')
  ]);
  const counts = Object.fromEntries(statsRows.map(x => [x.status, x.total]));
  res.render('admin', {
    records: records.map(normalizeRecord), filters, counts,
    critical: critical.total, overdue: overdue.total, total: total.total,
    departments: departments.map(x => x.department), types: TYPES, statuses: STATUSES, priorities: PRIORITIES, user: req.session.user
  });
}));

app.get('/admin/registro/:id', auth, asyncRoute(async (req, res) => {
  const record = normalizeRecord(await db.get('SELECT * FROM records WHERE id = $1', [Number(req.params.id)]));
  if (!record) return res.status(404).render('error', { message: 'Registro não encontrado.' });
  const [attachments, history] = await Promise.all([
    db.query('SELECT * FROM attachments WHERE record_id = $1 ORDER BY id', [record.id]),
    db.query('SELECT * FROM audit_logs WHERE record_id = $1 ORDER BY id DESC', [record.id])
  ]);
  res.render('record', { record, attachments, history: history.map(item => ({ ...item, created_at: normalizeDateTime(item.created_at) })), statuses: STATUSES, priorities: PRIORITIES, saved: req.query.saved === '1' });
}));

app.get('/admin/anexo/:id', auth, asyncRoute(async (req, res) => {
  const attachment = await db.get('SELECT * FROM attachments WHERE id = $1', [Number(req.params.id)]);
  if (!attachment) return res.status(404).send('Imagem não encontrada.');
  const buffer = await storage.downloadFile(attachment.filename);
  res.type(attachment.mime_type).send(buffer);
}));

app.post('/admin/registro/:id', auth, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status, 30);
  const priority = clean(req.body.priority, 20);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.due_date || '')) ? req.body.due_date : null;
  if (!STATUSES.includes(status)) return res.status(400).send('Status inválido.');
  if (!PRIORITIES.includes(priority)) return res.status(400).send('Prioridade inválida.');
  const previous = normalizeRecord(await db.get('SELECT * FROM records WHERE id=$1', [id]));
  if (!previous) return res.status(404).render('error', { message: 'Registro não encontrado.' });
  const assignedTo = clean(req.body.assigned_to, 150), notes = clean(req.body.internal_notes, 5000), resolution = clean(req.body.resolution, 5000);
  await db.run('UPDATE records SET status=$1, priority=$2, due_date=$3, internal_notes=$4, assigned_to=$5, resolution=$6 WHERE id=$7',
    [status, priority, dueDate, notes, assignedTo, resolution, id]);
  const changes = [];
  if (previous.status !== status) changes.push(`Status: ${previous.status} → ${status}`);
  if (previous.priority !== priority) changes.push(`Prioridade: ${previous.priority} → ${priority}`);
  if ((previous.due_date || '') !== (dueDate || '')) changes.push(`Prazo: ${previous.due_date || 'não definido'} → ${dueDate || 'não definido'}`);
  if ((previous.assigned_to || '') !== assignedTo) changes.push(`Responsável: ${assignedTo || 'não definido'}`);
  if ((previous.internal_notes || '') !== notes) changes.push('Observações internas atualizadas');
  if ((previous.resolution || '') !== resolution) changes.push('Solução adotada atualizada');
  if (changes.length) await addAudit(id, req.session.user.username, 'Registro atualizado', changes.join(' | '));
  res.redirect(`/admin/registro/${id}?saved=1`);
}));

app.post('/admin/registro/:id/arquivar', auth, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await db.run("UPDATE records SET status='Arquivado' WHERE id=$1", [id]);
  await addAudit(id, req.session.user.username, 'Registro arquivado');
  res.redirect('/admin');
}));

app.post('/admin/registro/:id/excluir', auth, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const files = await db.query('SELECT filename FROM attachments WHERE record_id=$1', [id]);
  await addAudit(id, req.session.user.username, 'Registro excluído');
  await db.run('DELETE FROM records WHERE id=$1', [id]);
  await storage.removeFiles(files.map(file => file.filename));
  res.redirect('/admin');
}));

app.get('/admin/relatorio', auth, asyncRoute(async (req, res) => {
  const { records, filters } = await getReportRecords(req.query);
  res.render('report', { records, filters, generatedAt: new Date() });
}));

app.get('/admin/relatorio.pdf', auth, asyncRoute(async (req, res) => {
  const { records } = await getReportRecords(req.query);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 48, left: 46, right: 46 }, bufferPages: true, info: { Title: 'Relatório CIPA Animália Park', Author: 'CIPA Animália Park' } });
  const green = '#174d3a', yellow = '#d2a900', muted = '#66766f', light = '#f3f6f3', line = '#d8dfda';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-cipa-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);

  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const ensureSpace = (height) => { if (doc.y + height > bottom()) doc.addPage(); };
  const label = (text, x, y) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor(muted).text(text.toUpperCase(), x, y, { characterSpacing: .6 });

  doc.font('Helvetica-Bold').fontSize(20).fillColor(green).text('CIPA ', { continued: true }).fillColor(yellow).text('Animália Park');
  doc.moveDown(.6).font('Helvetica-Bold').fontSize(24).fillColor('#183229').text('Relatório de sugestões e relatos');
  doc.moveDown(.25).font('Helvetica').fontSize(10).fillColor(muted).text('Material de apoio para análise, discussão e definição de possíveis soluções pela equipe.');
  doc.moveDown(.8).strokeColor(green).lineWidth(2).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(.7).fontSize(8.5).fillColor(muted).text(`Gerado em ${new Date().toLocaleString('pt-BR')}   |   ${records.length} registro(s)`);
  doc.moveDown(1.2);

  if (!records.length) doc.font('Helvetica').fontSize(12).fillColor(muted).text('Nenhum registro encontrado para os filtros selecionados.', { align: 'center' });

  for (const record of records) {
    ensureSpace(190);
    const startX = doc.page.margins.left, cardTop = doc.y;
    doc.roundedRect(startX, cardTop, usableWidth, 42, 7).fillAndStroke(light, line);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(`REGISTRO #${record.id}`, startX + 12, cardTop + 9);
    doc.fontSize(15).fillColor('#183229').text(record.type, startX + 12, cardTop + 21, { width: usableWidth - 130 });
    doc.fontSize(8.5).fillColor(green).text(`${record.priority} · ${record.status}`, startX + usableWidth - 150, cardTop + 15, { width: 138, align: 'right' });
    doc.y = cardTop + 54;

    const colGap = 8, colWidth = (usableWidth - colGap * 3) / 4, infoY = doc.y;
    const info = [
      ['Data', new Date(record.created_at + 'Z').toLocaleString('pt-BR')], ['Colaborador', record.employee_name],
      ['Setor', record.department], ['Prazo', record.due_date ? new Date(record.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definido']
    ];
    info.forEach(([name, value], index) => {
      const x = startX + index * (colWidth + colGap);
      doc.roundedRect(x, infoY, colWidth, 42, 5).fill(light);
      label(name, x + 8, infoY + 7);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#233d34').text(String(value), x + 8, infoY + 20, { width: colWidth - 16, height: 18, ellipsis: true });
    });
    doc.y = infoY + 55;

    label('Descrição', startX, doc.y);
    doc.moveDown(.45).font('Helvetica').fontSize(9.5).fillColor('#253d35');
    const descHeight = doc.heightOfString(record.description, { width: usableWidth });
    ensureSpace(descHeight + 25);
    doc.text(record.description, { width: usableWidth });
    doc.moveDown(.8);

    const printableImages = record.attachments.filter(image => ['image/jpeg', 'image/png'].includes(image.mime_type)).slice(0, 2);
    if (printableImages.length) {
      ensureSpace(135);
      label('Imagens anexadas', startX, doc.y);
      doc.moveDown(.5);
      const imageY = doc.y, imageGap = 10, imageWidth = (usableWidth - imageGap) / 2, imageHeight = 115;
      for (const [index, image] of printableImages.entries()) {
        const x = startX + index * (imageWidth + imageGap);
        try {
          const imageBuffer = await storage.downloadFile(image.filename);
          doc.image(imageBuffer, x, imageY, { fit: [imageWidth, imageHeight], align: 'center', valign: 'center' });
        } catch {}
      }
      doc.y = imageY + imageHeight + 10;
    }

    ensureSpace(165);
    const followY = doc.y, ownerWidth = 155, followGap = 10;
    doc.roundedRect(startX, followY, ownerWidth, 76, 5).strokeColor(line).stroke();
    label('Responsável na CIPA', startX + 9, followY + 9);
    doc.font('Helvetica').fontSize(9).fillColor('#253d35').text(record.assigned_to || 'A definir', startX + 9, followY + 24, { width: ownerWidth - 18 });
    const notesX = startX + ownerWidth + followGap, notesWidth = usableWidth - ownerWidth - followGap;
    doc.roundedRect(notesX, followY, notesWidth, 76, 5).strokeColor(line).stroke();
    label('Observações internas', notesX + 9, followY + 9);
    doc.font('Helvetica').fontSize(8.5).fillColor('#253d35').text(record.internal_notes || '________________________________________________________________\n________________________________________________________________', notesX + 9, followY + 24, { width: notesWidth - 18, height: 44, ellipsis: true });
    const resolutionY = followY + 86;
    doc.roundedRect(startX, resolutionY, usableWidth, 58, 5).strokeColor(line).stroke();
    label('Solução adotada', startX + 9, resolutionY + 9);
    doc.font('Helvetica').fontSize(8.5).fillColor('#253d35').text(record.resolution || '________________________________________________________________________________\n________________________________________________________________________________', startX + 9, resolutionY + 24, { width: usableWidth - 18, height: 27, ellipsis: true });
    doc.y = resolutionY + 74;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(muted).text(`CIPA Animália Park  |  Página ${i + 1} de ${range.count}`, doc.page.margins.left, doc.page.height - 27, { width: usableWidth, align: 'center', lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }
  doc.end();
}));

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
app.get('/admin/exportar.csv', auth, asyncRoute(async (req, res) => {
  const clause = whereFor(filtersFrom(req.query));
  const rows = (await db.query(`SELECT * FROM records${clause.sql} ORDER BY id DESC`, clause.params)).map(normalizeRecord);
  const headers = ['ID','Data','Nome','Setor','Cargo','Tipo','Descrição','Prioridade','Prazo','Status','Responsável','Observações internas','Solução adotada'];
  const csv = '\uFEFF' + [headers, ...rows.map(r => [r.id,r.created_at,r.employee_name,r.department,r.job_title,r.type,r.description,r.priority,r.due_date,r.status,r.assigned_to,r.internal_notes,r.resolution])]
    .map(row => row.map(csvCell).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="registros-cipa-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
}));

app.get('/admin/qrcode', auth, asyncRoute(async (req, res) => {
  const lanAddress = getLanAddresses()[0];
  const detectedLanUrl = lanAddress ? `${req.protocol}://${lanAddress}:${PORT}` : `${req.protocol}://${req.get('host')}`;
  const lanUrl = clean(req.query.lanUrl, 300) || detectedLanUrl;
  const wanUrl = clean(req.query.wanUrl, 300) || publicUrlFromRequest(req);
  const defaultMode = wanUrl.includes('onrender.com') ? 'wan' : 'lan';
  const mode = req.query.mode === 'lan' || req.query.mode === 'wan' ? req.query.mode : defaultMode;
  const url = mode === 'wan' ? wanUrl : lanUrl;
  const qr = await QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: '#123f31', light: '#ffffff' } });
  res.render('qrcode', { url, qr, lanUrl, wanUrl, mode });
}));

app.use((req, res) => res.status(404).render('error', { message: 'Página não encontrada.' }));
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(400).render('error', { message: 'Não foi possível anexar a imagem. Use até 4 fotos de no máximo 6 MB cada.' });
  if (error.code === 'UNSUPPORTED_IMAGE') return res.status(400).render('error', { message: 'Formato de imagem não suportado. Envie uma foto JPG, PNG, WEBP ou HEIC.' });
  next(error);
});
app.use((error, req, res, next) => { console.error(error); res.status(500).render('error', { message: 'Ocorreu um erro interno.' }); });

let server;
async function start() {
  await db.initDb();
  await ensureAdmin();
  await storage.ensureBucket();
  console.log(`Supabase conectado. Bucket de anexos: ${storage.bucket}`);
  server = app.listen(PORT, HOST, () => {
    const addresses = getLanAddresses().map(address => `http://${address}:${PORT}`);
    console.log('\nCIPA Animália Park iniciado!');
    console.log(`Local: http://localhost:${PORT}`);
    addresses.forEach(url => console.log(`Rede:  ${url}`));
    console.log(`Admin: http://localhost:${PORT}/login\n`);
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});

module.exports = { app, get server() { return server; } };
