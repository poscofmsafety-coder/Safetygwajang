// functions/api/search.js
// Cloudflare Pages Functions - 공공데이터포털 API 프록시

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') || '';

    // 🔑 공공데이터포털 Decoding 인증키 (서버 측에서만 사용 → 보안 강화)
    const KOSHA_API_KEY = "4b39abd89a4760da331813df65f3d422dbb86fca4ce6db701a0aa6919a49a9a4";

    // 공공데이터포털 API 호출 URL 구성
    const apiUrl = `https://apis.data.go.kr/B552468/srch/smartSearch`
        + `?serviceKey=${encodeURIComponent(KOSHA_API_KEY)}`
        + `&pageNo=1`
        + `&numOfRows=100`
        + `&searchValue=${encodeURIComponent(keyword)}`
        + `&category=0`
        + `&type=json`
        + `&_type=json`;

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const data = await response.text();

        return new Response(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'  // 5분 캐시
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ 
            error: 'API 호출 실패', 
            message: error.message 
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
