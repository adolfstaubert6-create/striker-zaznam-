const https = require('https');
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return {statusCode:405,body:JSON.stringify({error:'Method not allowed'})};
  let body;
  try {body=JSON.parse(event.body)} catch {return {statusCode:400,body:JSON.stringify({error:'Invalid JSON'})}}
  const {ids}=body;
  if (!ids||!ids.length) return {statusCode:400,body:JSON.stringify({error:'Chýbajú ids'})};
  const SUPABASE_URL=process.env.SUPABASE_URL;
  const SECRET_KEY='sb_secret_qZYcILt8InUkgA2r9KKF9A_N-96Lp3C';
  try {
    await deleteRecords(SUPABASE_URL, SECRET_KEY, ids);
    return {statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({deleted:ids.length})};
  } catch(e) {
    return {statusCode:500,body:JSON.stringify({error:e.message})};
  }
};
function deleteRecords(url,key,ids) {
  return new Promise((resolve,reject) => {
    const u=new URL(`${url}/rest/v1/zaznam?id=in.(${ids.join(',')})`);
    const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'DELETE',headers:{'apikey':key,'Authorization':`Bearer ${key}`,'Prefer':'return=minimal'}},res => {
      let d='';
      res.on('data',chunk=>d+=chunk);
      res.on('end',()=>{if(res.statusCode>=200&&res.statusCode<300)resolve();else reject(new Error(`Status ${res.statusCode}: ${d}`))});
    });
    req.on('error',reject);req.end();
  });
}
