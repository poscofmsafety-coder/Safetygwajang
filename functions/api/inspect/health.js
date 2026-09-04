// functions/api/inspect/health.js
// Cloudflare Pages Functions - API 헬스체크 엔드포인트
// 프론트 checkApiHealth() 가 호출: GET /api/inspect/health
//
// 목적: 프록시가 살아있고, KOSHA API 키가 유효한지 확인

export async function onRequest(context) {
    const { request } = context;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders()
        });
    }

    try {
        // KOSHA API 간단 핑 테스트 (벤젠 CAS로 1건만 요청)
        const KOSHA_API_KEY = "4b39abd89a4760da331813df65f3d422dbb86fca4ce6db701a0aa6919a49a9a4";
        const testUrl = `https://apis.data.go.kr/B552468/srch/smartSearch`
            + `?serviceKey=${encodeURIComponent(KOSHA_API_KEY)}`
            + `&pageNo=1&numOfRows=1`
            + `&searchValue=${encodeURIComponent('71-43-2')}`
            + `&category=2&type=json&_type=json`;

        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3000);

        const res = await fetch(testUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: ctrl.signal
        });
        clearTimeout(timeout);

        const koshaOk = res.ok;
        let koshaNote = koshaOk ? 'KOSHA API 응답 정상' : `HTTP ${res.status}`;

        return json({
            ok: true,
            status: 'healthy',
            proxy: 'running',
            kosha: {
                connected: koshaOk,
                note: koshaNote
            },
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });

    } catch (e) {
        // KOSHA API 자체가 죽어있어도 프록시는 살아있음
        return json({
            ok: true,
            status: 'degraded',
            proxy: 'running',
            kosha: {
                connected: false,
                note: e.message || 'KOSHA API 응답 없음'
            },
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    }
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: corsHeaders()
    });
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache'
    };
}
