import http from 'node:http';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
      ? process.argv[++i]
      : 'true';
    args.set(key, value);
  }
}

const host = args.get('host') || process.env.HOST || '127.0.0.1';
const port = Number(args.get('port') || process.env.PORT || 8787);
const modelId = args.get('model') || process.env.MODEL || 'sullyos-mock';

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return '';
    }).join('\n');
  }
  return '';
}

function getLastUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return contentToText(messages[i].content).trim();
    }
  }
  return '';
}

function makeChatCompletion(payload) {
  const lastUserText = getLastUserText(payload.messages);
  const excerpt = lastUserText ? lastUserText.slice(0, 80) : '我没有收到用户正文，但接口已经连通。';
  const reply = [
    `本地 mock 接口收到啦：${excerpt}`,
    '这条回复来自 SullyOS 本地测试接口，说明前端请求、AI 返回、气泡显示这一条线已经通了。',
  ].join('\n');

  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payload.model || modelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: reply,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: Math.max(1, JSON.stringify(payload.messages || []).length / 4 | 0),
      completion_tokens: Math.max(1, reply.length / 4 | 0),
      total_tokens: Math.max(1, (JSON.stringify(payload.messages || []).length + reply.length) / 4 | 0),
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/models' || url.pathname === '/v1/models')) {
    sendJson(res, 200, {
      object: 'list',
      data: [{ id: modelId, object: 'model', owned_by: 'local' }],
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, { ok: true, service: 'sullyos-mock-openai', model: modelId });
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/chat/completions' || url.pathname === '/v1/chat/completions')) {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      console.log(`[mock-openai] ${req.method} ${url.pathname} model=${payload.model || modelId} messages=${payload.messages?.length || 0}`);
      sendJson(res, 200, makeChatCompletion(payload));
    } catch (error) {
      sendJson(res, 400, {
        error: {
          message: error instanceof Error ? error.message : 'Invalid request',
          type: 'invalid_request_error',
        },
      });
    }
    return;
  }

  sendJson(res, 404, {
    error: {
      message: `No mock route for ${req.method} ${url.pathname}`,
      type: 'not_found',
    },
  });
});

server.listen(port, host, () => {
  console.log(`[mock-openai] listening on http://${host}:${port}`);
  console.log(`[mock-openai] base URL for SullyOS: http://${host}:${port}/v1`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
