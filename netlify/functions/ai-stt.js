const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chýba OPENAI_API_KEY' }) };
  }

  try {
    let audioBase64;
    try {
      const body = JSON.parse(event.body);
      audioBase64 = body.audio;
    } catch(e) {
      audioBase64 = event.body;
    }

    if (!audioBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Chýba audio' }) };
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const boundary = '----FormBoundary' + Date.now().toString(16);

    const formParts = [];
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`));
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nsk\r\n`));
    formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`));
    formParts.push(audioBuffer);
    formParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const formBody = Buffer.concat(formParts);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': formBody.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      req.write(formBody);
      req.end();
    });

    const parsed = JSON.parse(result.body);
    if (result.status !== 200) {
      return { statusCode: 500, body: JSON.stringify({ error: parsed.error?.message || 'Whisper chyba' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parsed.text || '' })
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
