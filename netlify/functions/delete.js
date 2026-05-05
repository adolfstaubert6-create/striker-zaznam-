
exports.handler = async function(event) {
  if(event.httpMethod !== 'POST') return {statusCode:405, body:'Method Not Allowed'};
  const {ids} = JSON.parse(event.body);
  if(!ids || !ids.length) return {statusCode:400, body:'No IDs'};
  const SUPABASE_URL = 'https://jjvegnwqipmcipwvdjje.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    }
  });
  if(res.ok) return {statusCode:200, body:'OK'};
  const err = await res.text();
  return {statusCode:500, body:err};
};
