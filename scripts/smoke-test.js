const fs = require('node:fs');
const path = require('node:path');

process.env.PORT = '3199';
process.env.DATA_DIR = path.join(__dirname, '..', 'data');
const db = require('../src/db');
const { server } = require('../src/server');

const base = 'http://127.0.0.1:3199';
const marker = `Auditoria-${Date.now()}`;
let recordId;
let storedFilename;

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  ${message}`);
}

async function run() {
  await new Promise(resolve => setTimeout(resolve, 500));

  const home = await fetch(`${base}/`);
  check(home.status === 200 && (await home.text()).includes('Registre sua sugestão ou relato'), 'formulário público');

  const blocked = await fetch(`${base}/admin`, { redirect: 'manual' });
  check(blocked.status === 302 && blocked.headers.get('location').startsWith('/login'), 'painel exige autenticação');

  const badLogin = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ username: 'errado', password: 'errado' }), redirect: 'manual' });
  check(badLogin.status === 401, 'credenciais inválidas são recusadas');

  const login = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ username: 'admincipa', password: 'Cipa@2027@', next: '/admin' }), redirect: 'manual' });
  check(login.status === 302 && login.headers.get('set-cookie'), 'login administrativo');
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const invalid = new FormData();
  invalid.set('employee_name', marker);
  invalid.set('department', 'CIPA');
  invalid.set('type', 'Sugestão');
  invalid.set('description', 'Teste de formato inválido.');
  invalid.set('photos', new Blob(['arquivo'], { type: 'text/plain' }), 'arquivo.txt');
  const invalidResponse = await fetch(`${base}/enviar`, { method: 'POST', body: invalid });
  check(invalidResponse.status === 400, 'arquivo inválido é recusado com segurança');

  const form = new FormData();
  form.set('employee_name', marker);
  form.set('department', 'CIPA');
  form.set('job_title', 'Auditoria');
  form.set('type', 'Relato de risco');
  form.set('description', 'Registro temporário criado pelo teste automatizado de ponta a ponta.');
  form.set('photos', new Blob([fs.readFileSync(path.join(__dirname, '..', 'public', 'images', 'animalia-background.png'))], { type: 'image/png' }), 'auditoria.png');
  const sent = await fetch(`${base}/enviar`, { method: 'POST', body: form, redirect: 'manual' });
  check(sent.status === 302 && sent.headers.get('location') === '/?success=1', 'envio com imagem');

  const record = db.prepare('SELECT * FROM records WHERE employee_name = ? ORDER BY id DESC LIMIT 1').get(marker);
  check(record && record.status === 'Novo', 'registro persistido no SQLite');
  recordId = Number(record.id);
  const attachment = db.prepare('SELECT * FROM attachments WHERE record_id = ?').get(recordId);
  check(attachment, 'metadados da imagem persistidos');
  storedFilename = attachment.filename;

  const protectedImage = await fetch(`${base}/admin/anexo/${attachment.id}`, { redirect: 'manual' });
  check(protectedImage.status === 302, 'imagem bloqueada sem login');
  const image = await fetch(`${base}/admin/anexo/${attachment.id}`, { headers: { cookie } });
  check(image.status === 200 && image.headers.get('content-type').includes('image/png'), 'imagem disponível para administrador');

  const detail = await fetch(`${base}/admin/registro/${recordId}`, { headers: { cookie } });
  check(detail.status === 200 && (await detail.text()).includes('Imagens anexadas'), 'detalhe do registro');

  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const updated = await fetch(`${base}/admin/registro/${recordId}`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ status: 'Em análise', priority: 'Crítica', due_date: dueDate, assigned_to: 'Equipe CIPA', internal_notes: 'Avaliar na reunião.', resolution: 'Solução em avaliação.' }), redirect: 'manual' });
  const updatedRecord = db.prepare('SELECT * FROM records WHERE id=?').get(recordId);
  check(updated.status === 302 && updatedRecord.status === 'Em análise' && updatedRecord.priority === 'Crítica' && updatedRecord.due_date === dueDate, 'prioridade, prazo e acompanhamento');
  check(db.prepare('SELECT COUNT(*) total FROM audit_logs WHERE record_id=?').get(recordId).total >= 2, 'histórico de alterações');

  const filtered = await fetch(`${base}/admin?q=${encodeURIComponent(marker)}&status=Em%20an%C3%A1lise&priority=Cr%C3%ADtica`, { headers: { cookie } });
  check(filtered.status === 200 && (await filtered.text()).includes(marker), 'busca e filtros');

  const csv = await fetch(`${base}/admin/exportar.csv?q=${encodeURIComponent(marker)}`, { headers: { cookie } });
  check(csv.status === 200 && (await csv.text()).includes(marker), 'exportação CSV');

  const report = await fetch(`${base}/admin/relatorio?q=${encodeURIComponent(marker)}`, { headers: { cookie } });
  check(report.status === 200 && (await report.text()).includes('Relatório de sugestões e relatos'), 'relatório para impressão');

  const pdf = await fetch(`${base}/admin/relatorio.pdf?q=${encodeURIComponent(marker)}`, { headers: { cookie } });
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  check(pdf.status === 200 && pdf.headers.get('content-type').includes('application/pdf') && pdfBytes.subarray(0, 4).toString() === '%PDF', 'relatório PDF');
  if (process.env.SAVE_PDF === '1') {
    const previewDir = path.join(__dirname, '..', 'tmp', 'pdfs');
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, 'relatorio-preview.pdf'), pdfBytes);
  }

  const qr = await fetch(`${base}/admin/qrcode`, { headers: { cookie } });
  check(qr.status === 200 && (await qr.text()).includes('Cartaz do canal CIPA'), 'geração de QR Code e cartaz');

  const removed = await fetch(`${base}/admin/registro/${recordId}/excluir`, { method: 'POST', headers: { cookie }, redirect: 'manual' });
  check(removed.status === 302 && !db.prepare('SELECT id FROM records WHERE id=?').get(recordId), 'exclusão do registro');
  check(!fs.existsSync(path.join(process.env.DATA_DIR, 'uploads', storedFilename)), 'arquivo da imagem removido junto com o registro');
  db.prepare('DELETE FROM audit_logs WHERE record_id=?').run(recordId);
  recordId = null;

  console.log('\nAuditoria concluída sem falhas.');
}

run().catch(error => {
  console.error('\nFALHA:', error.message);
  process.exitCode = 1;
}).finally(() => {
  if (recordId) {
    const files = db.prepare('SELECT filename FROM attachments WHERE record_id=?').all(recordId);
    db.prepare('DELETE FROM records WHERE id=?').run(recordId);
    files.forEach(file => fs.rmSync(path.join(process.env.DATA_DIR, 'uploads', file.filename), { force: true }));
  }
  server.close();
});
