const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET || 'cipa-anexos';

if (!supabaseUrl) throw new Error('Defina SUPABASE_URL com a URL do projeto Supabase.');
if (!serviceRoleKey) throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY com a chave service_role do Supabase.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function ensureBucket() {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (!error && data) return;
  const created = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 6 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  });
  if (created.error && created.error.message !== 'The resource already exists') throw created.error;
}

async function uploadFile(file) {
  const extension = (file.originalname || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;
  return filename;
}

async function removeFiles(filenames) {
  const names = filenames.filter(Boolean);
  if (!names.length) return;
  const { error } = await supabase.storage.from(bucket).remove(names);
  if (error) throw error;
}

async function downloadFile(filename) {
  const { data, error } = await supabase.storage.from(bucket).download(filename);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

module.exports = { bucket, ensureBucket, uploadFile, removeFiles, downloadFile };
