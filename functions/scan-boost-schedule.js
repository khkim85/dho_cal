// netlify/functions/scan-boost-schedule.js
//
// mw.html "부양" 탭의 "AI 스캔 등록"에서 호출.
// "교역 스케줄" 형태의 리스트 스크린샷(시간/위치/이벤트/추천 품목 열이 있는 것)을 분석해서
// { rows: [{ time, region, kind, items: [{name, priceRange}] }] } 로 돌려준다.
//
// 참고 사이트(대항오 덱 매니저) 형식의 화면을 염두에 두고 짠 프롬프트라, 다른 형식의
// 스크린샷을 넣으면 정확도가 떨어질 수 있음 — 그럴 땐 프롬프트를 조정해야 한다.


function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

const MODEL = "gemini-3.1-flash-lite";

const PROMPT = `다음은 "대항해시대 오리진" 게임 관련 커뮤니티 사이트의 "교역 스케줄" 목록 스크린샷이다.
각 행에는 날짜/시각, 지역(위치), 이벤트 종류(예: 후원/전염병/사치/전쟁/홍수/축제/개발/호황 등), 그리고
추천 품목(품목명과 가격 범위, 예: "코아우아우 31~16만")이 여러 개 나열되어 있다.

이미지에서 각 행을 추출해서 아래 JSON 형식으로만 답하라 (다른 설명, 코드블록 표시 없이 JSON 텍스트만):

{
  "rows": [
    {
      "date": "M.D 형식의 날짜 (예: 9.5). 연도 표기가 없으면 2026년으로 간주",
      "hour": 정수(0~23, "17시"처럼 표기된 시각의 숫자만),
      "region": "지역/위치 이름 (화면에 표기된 그대로, 예: 동지중해, 카리브, 북미서)",
      "kind": "이벤트 종류 (예: 후원, 전염병, 사치, 전쟁, 홍수, 축제, 개발, 호황)",
      "items": [
        { "name": "품목명", "priceRange": "화면에 표기된 가격 범위 텍스트 그대로 (예: 31~16만)" }
      ]
    }
  ]
}

여러 장의 이미지가 함께 주어지면 모든 행을 rows 배열 하나에 합쳐라. 화면에서 잘려서 안 보이는
추천 품목은 무시하고 보이는 것만 담아라.`;

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ ok: false, error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: "잘못된 요청 본문" }, 400);
  }

  const images = payload.images || [];
  if (images.length === 0) {
    return jsonResponse({ ok: false, error: "이미지가 없습니다." }, 400);
  }

  const parts = [{ text: PROMPT }];
  images.forEach((img) => {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );
    const json = await res.json();

    const text =
      json.candidates &&
      json.candidates[0] &&
      json.candidates[0].content &&
      json.candidates[0].content.parts &&
      json.candidates[0].content.parts[0] &&
      json.candidates[0].content.parts[0].text;

    if (!text) {
      const apiError = json.error ? (json.error.message || JSON.stringify(json.error)) : null;
      return jsonResponse({
          ok: false,
          error: apiError ? "Gemini API 오류: " + apiError : "AI 응답을 이해하지 못했습니다.",
          raw: json,
        }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return jsonResponse({ ok: false, error: "AI 응답이 JSON 형식이 아닙니다.", raw: text }, 502);
    }

    return jsonResponse({ ok: true, data: parsed }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
}
