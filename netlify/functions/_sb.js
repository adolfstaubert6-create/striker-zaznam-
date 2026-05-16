// Shared Supabase REST helper for Netlify functions
// Usage: const { sbGet, sbPost } = require('./_sb');
const https = require('https');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

function sbRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url     = new URL(BASE + path);
    const headers = {
      apikey:         KEY,
      Authorization:  `Bearer ${KEY}`,
      'Content-Type': 'application/json'
    };
    if (method === 'POST' || method === 'PATCH') headers.Prefer = 'return=minimal';
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`SB ${res.statusCode}: ${d.slice(0, 300)}`));
          } else {
            try { resolve(d ? JSON.parse(d) : []); }
            catch { resolve([]); }
          }
        });
      }
    );
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Supabase timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sbGet  = path       => sbRequest('GET',  path, null);
const sbPost = (path, b)  => sbRequest('POST', path, b);

// Check if ai-agent already sent a specific message type today
async function alreadySent(type) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sbGet(
    `/rest/v1/chat_messages?author=eq.ai-agent&metadata->>type=eq.${encodeURIComponent(type)}&metadata->>date=eq.${today}&select=id&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

// Post a message to chat as ai-agent
async function postAgentMessage(text, msgType, metaType) {
  const today = new Date().toISOString().slice(0, 10);
  return sbPost('/rest/v1/chat_messages', {
    author:   'ai-agent',
    text,
    type:     msgType,
    pinned:   false,
    metadata: { type: metaType, date: today }
  });
}

// Call Claude API (claude-sonnet-4-5)
function callClaude(systemPrompt, userMessage) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const body = JSON.stringify({
    model:      'claude-sonnet-4-5',
    max_tokens: 600,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMessage }]
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (res.statusCode !== 200) reject(new Error(p.error?.message || `Claude ${res.statusCode}`));
          else resolve((p.content?.[0]?.text || '').trim());
        } catch(e) { reject(e); }
      });
    });
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Verify CRON_SECRET token
function authCron(event) {
  const token = event.queryStringParameters?.token;
  return token === process.env.CRON_SECRET;
}

module.exports = { sbGet, sbPost, alreadySent, postAgentMessage, callClaude, authCron };
