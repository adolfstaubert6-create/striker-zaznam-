
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { ids } = JSON.parse(event.body || '{}');

    if (!Array.isArray(ids) || ids.length === 0) {
      return { statusCode: 400, body: 'No IDs provided' };
    }

    const cleanIds = ids.map(Number).filter(Number.isFinite);

    if (cleanIds.length === 0) {
      return { statusCode: 400, body: 'Invalid IDs' };
    }

    const SUPABASE_URL = 'https://jjvegnwqipmcipwvdjje.supabase.co';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SERVICE_KEY) {
      return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_ROLE_KEY' };
    }

    const url = `${SUPABASE_URL}/rest/v1/zaznam?id=in.(${cleanIds.join(',')})`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=minimal'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, body: err };
    }

    return { statusCode: 200, body: 'OK' };

  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
