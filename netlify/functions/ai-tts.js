const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chýba OPENAI_API_KEY' }) };
  }

  let text;
  try {
    const body = JSON.parse(event.body);
    text = body.text || '';
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

  if (!text || text.length > 4000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Neplatný text' }) };
  }

  const requestBody = JSON.stringify({
    model: 'tts-1',
    input: text,
    voice: 'nova',
    response_format: 'mp3',
    speed: 0.95
  });

  try {
    const audioBuffer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`OpenAI TTS error: ${res.statusCode}`));
          } else {
            resolve(Buffer.concat(chunks));
          }
        });
      });

      req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString()
      },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
