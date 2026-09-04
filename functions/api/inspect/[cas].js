// functions/api/inspect/[cas].js
// KOSHA smartSearch API 프록시 (단일 소스, 최소 구조)
// search.js 검증된 패턴 그대로 사용

export async function onRequest(context) {
    const { params, request } = context;
    const url = new URL(request.url);
    const cas = (params.cas || '').trim();

    // CORS Preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors() });
    }

    // health 체크 (같은 라우트에서 처리)
    if (cas === 'health') {
        return json({
            ok: true,
            status: 'healthy',
            proxy: 'running',
            timestamp: new Date().toISOString(),
            version: '5.0.0-minimal'
        });
    }

    if (!cas) {
        return json({ ok: false, error: 'CAS No.가 필요합니다' }, 400);
    }

    if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) {
        return json({
            ok: false, casNo: cas,
            error: `잘못된 CAS 형식: ${cas} (예: 71-43-2)`
        }, 400);
    }

    const KOSHA_API_KEY = "4b39abd89a4760da331813df65f3d422dbb86fca4ce6db701a0aa6919a49a9a4";
    const apiUrl = `https://apis.data.go.kr/B552468/srch/smartSearch`
        + `?serviceKey=${encodeURIComponent(KOSHA_API_KEY)}`
        + `&pageNo=1`
        + `&numOfRows=30`
        + `&searchValue=${encodeURIComponent(cas)}`
        + `&category=2`
        + `&type=json&_type=json`;

    const startTs = Date.now();

    try {
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            return json({
                ok: false, casNo: cas,
                error: `KOSHA API HTTP ${res.status}`
            }, 502);
        }

        const text = await res.text();

        if (text.trim().startsWith('<')) {
            return json({
                ok: false, casNo: cas,
                error: 'KOSHA API XML 에러 응답',
                sample: text.substring(0, 200)
            }, 502);
        }

        const data = JSON.parse(text);
        const body = data?.response?.body || {};
        let items = body?.items?.item || [];
        if (!Array.isArray(items)) items = items ? [items] : [];
        const totalCount = Number(body?.totalCount || 0);

        // 매칭 판정
        const result = analyze(cas, items);

        return json({
            ok: true,
            casNo: cas,
            matchedName: result.matchedName,
            status: result.hit ? 'REGULATED' : 'NO_MATCH',
            tags: result.tags,
            docs: result.docs,
            meta: {
                totalHits: totalCount,
                analyzedItems: items.length,
                elapsedMs: Date.now() - startTs
            }
        });

    } catch (e) {
        return json({
            ok: false, casNo: cas,
            error: e.message || '조회 실패'
        }, 500);
    }
}

/* =========================================================
   판정: KOSHA 문서 중 CAS를 실제 포함하는 것만 추림
   ========================================================= */
function analyze(cas, items) {
    const tags = new Set();
    const docs = [];
    let matchedName = null;
    let hit = false;

    for (const item of items) {
        const content = String(item.content || '');
        const title = String(item.title || '');
        const docId = String(item.doc_id || '');
        const highlight = String(item.highlight_content || '');

        // CAS가 실제로 포함되어야 매칭 인정
        if (!content.includes(cas) && !title.includes(cas) && !highlight.includes(cas)) {
            continue;
        }

        hit = true;
        docs.push({
            docId: docId.substring(0, 60),
            title: title.substring(0, 100),
            score: item.score || 0
        });

        // 태그 추출
        if (title.includes('제조') && title.includes('금지')) tags.add('제조금지');
        if (title.includes('허가') && title.includes('대상')) tags.add('허가대상');
        if (title.includes('허용기준') || title.includes('노출기준')) tags.add('노출기준');
        if (title.includes('작업환경측정')) tags.add('작업환경측정');
        if (title.includes('특수건강진단')) tags.add('특수건강진단');
        if (title.includes('관리대상')) tags.add('관리대상');
        if (content.includes('특별관리물질')) tags.add('특별관리물질');

        // 물질명 추출 (CAS 앞의 한글명)
        if (!matchedName) {
            const idx = content.indexOf(cas);
            if (idx > 0) {
                const before = content.substring(Math.max(0, idx - 60), idx);
                const m = before.match(/([가-힣][가-힣A-Za-z0-9\-]{1,25})\s*[\(
\[;,]?\s*$/);
                if (m) matchedName = m[1].trim();
            }
        }
    }

    return {
        hit,
        matchedName,
        tags: [...tags],
        docs: docs.slice(0, 10)
    };
}

/* =========================================================
   유틸
   ========================================================= */
function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: cors() });
}

function cors() {
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=1800'
    };
}
