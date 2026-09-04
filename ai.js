/* ============================================================
   안전과장 CBT - Groq AI 프록시 (Cloudflare Pages Functions)
   경로 : /api/ai
   · API 키는 Cloudflare 환경변수에만 존재 (브라우저 노출 없음)
   · 같은 도메인이므로 CORS 문제 없음
   ============================================================ */

const UPSTREAM = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_BODY = 80 * 1024;

const MODELS = new Set([
  'groq/compound',
  'groq/compound-mini',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'moonshotai/kimi-k2-instruct'
]);

const H = { 'Content-Type': 'application/json; charset=utf-8' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

/* ---------- 상태 확인 (브라우저에서 /api/ai 접속) ---------- */
export function onRequestGet({ env }) {
  return json({
    ok: true,
    service: 'cbt-groq-proxy',
    keyConfigured: !!env.GROQ_API_KEY,
    models: Array.from(MODELS)
  });
}

export function onRequestOptions() {
  return new Response(null, {
    headers: { 'Allow': 'GET, POST, OPTIONS', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
  });
}

/* ---------- 실제 생성 ---------- */
export async function onRequestPost({ request, env }) {
  if (!env.GROQ_API_KEY) {
    return json({ error: { message: '서버에 GROQ_API_KEY 환경변수가 설정되지 않았습니다. Cloudflare Pages > Settings > Variables and Secrets 에서 등록해 주세요.' } }, 500);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return json({ error: { message: '요청이 너무 깁니다. 채용공고·경력사항을 줄여 주세요.' } }, 413);
  }

  let body;
  try { body = JSON.parse(raw); }
  catch { return json({ error: { message: '요청 형식이 올바르지 않습니다.' } }, 400); }

  if (!MODELS.has(body.model)) {
    return json({ error: { message: '허용되지 않은 모델입니다: ' + body.model } }, 400);
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return json({ error: { message: 'messages 가 비어 있습니다.' } }, 400);
  }

  if (!body.max_completion_tokens || body.max_completion_tokens > 8192) {
    body.max_completion_tokens = 6144;
  }
  body.stream = false;

  let res;
  try {
    res = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.GROQ_API_KEY
      },
      body: JSON.stringify(body)
    });
  } catch {
    return json({ error: { message: 'AI 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.' } }, 502);
  }

  const text = await res.text();
  return new Response(text, { status: res.status, headers: H });
}
