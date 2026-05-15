const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB after base64 decode

function corsHeaders(origin) {
  const allowed = process.env.ALLOWED_ORIGINS || '*';
  const allowOrigin = allowed === '*' ? '*' :
    allowed.split(',').map(s => s.trim()).includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

module.exports = async function handler(req, res) {
  const headers = corsHeaders(req.headers.origin || '');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data, contentType, filename } = req.body;

    if (!data || !contentType) {
      return res.status(400).json({ error: 'Missing data or contentType' });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, HEIC' });
    }

    const buffer = Buffer.from(data, 'base64');

    if (buffer.length > MAX_SIZE_BYTES) {
      return res.status(400).json({ error: 'File too large. Maximum 5MB.' });
    }

    const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('tree-photos')
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload photo' });
    }

    const { data: urlData } = supabase.storage
      .from('tree-photos')
      .getPublicUrl(path);

    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
