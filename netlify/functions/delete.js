exports.handler = async function(event) {
  if(event.httpMethod!=='POST') return {statusCode:405,body:'Method Not Allowed'};
  const {ids}=JSON.parse(event.body);
  const SUPABASE_URL=process.env.SUPABASE_URL;
  const SUPABASE_KEY='sb_publishable_394--dKKaFRvFmwloXC1bw_Wj7KWv42';
  const res=await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=in.(${ids.join(',')})`,{method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Prefer':'return=minimal'}});
  if(res.ok) return {statusCode:200,body:'ok'};
  return {statusCode:500,body:'Chyba'};
};
