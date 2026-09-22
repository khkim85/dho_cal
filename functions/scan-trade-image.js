// netlify/functions/scan-trade-image.js
//
// mw.html(관리자 페이지)의 "AI 스캔 등록"에서 호출하는 서버리스 함수.
// 클라이언트가 이미지(base64)를 보내면, Gemini Vision API로 분석해서
// { itemName, rows: [{city, price, marketRate}] } 형태로 돌려준다.
//
// GEMINI_API_KEY는 Netlify 대시보드의 환경변수로만 등록하고, 코드에는 절대 넣지 않는다.


function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

const MODEL = "gemini-3.1-flash-lite";

const PROMPT = `다음은 "대항해시대 오리진(Uncharted Waters Origin)" 게임의 교역품 도시별 판매가 목록 스크린샷이다.
화면은 아래 두 가지 형태 중 하나일 수 있으니, 실제로 보이는 형태에 맞게 처리하라:

[형태 A] "보유 교역품 추천" 등: 왼쪽에 품목 목록이 있고 그중 하나가 노랗게 강조되어 있으며,
  오른쪽 표에 그 품목의 도시별 시세가 나열된 형태. 이 경우 itemName은 왼쪽에서 강조된 품목명이고,
  rows는 오른쪽 표의 도시들이다.

[형태 B] 도시 상세("교역"/"선창" 탭) 화면: 상단 중앙에 도시명이 하나 표시되고,
  그 아래 여러 품목이 세로로 나열되며 각 줄에 품목명, 시세, 전체판매가가 순서대로 있는 형태.
  이 경우 화면 하나에 여러 품목이 있으므로, itemName 단일 값이 아니라 품목별로 결과를 나눠야 한다.

이미지에서 정보를 추출해서 아래 JSON 형식으로만 답하라 (다른 설명, 코드블록 표시 없이 JSON 텍스트만):

{
  "layout": "A 또는 B — 실제로 판단한 화면 형태",
  "itemName": "형태 A일 때: 왼쪽에서 강조된 교역품 이름. 형태 B일 때: null",
  "rows": [
    { "city": "도시명(한글)", "price": 정수(쉼표 제거한 전체 판매가), "marketRate": 정수(시세 퍼센트의 숫자만, % 기호 제외) }
  ],
  "itemsByCity": [
    { "city": "형태 B일 때 상단에 표시된 도시명(한글). 형태 A일 때는 이 배열 자체를 빈 배열로 둔다",
      "items": [
        { "itemName": "품목명(한글)", "price": 정수(쉼표 제거한 전체 판매가), "marketRate": 정수(시세 퍼센트의 숫자만, % 기호 제외) }
      ]
    }
  ]
}

형태 A면 rows를 채우고 itemsByCity는 빈 배열로, 형태 B면 itemsByCity를 채우고 rows는 빈 배열로 둔다.
여러 장의 이미지가 함께 주어지면, 같은 형태끼리는 모두 합치고(형태 A는 rows 하나에, 형태 B는 itemsByCity에 도시별로 항목 추가),
같은 도시/같은 품목이 여러 이미지에 중복 등장하면 한 번만 포함하라.
"관세"나 "행사" 열은 무시하고 도시명/품목명/시세/전체 판매가만 추출하라.`;

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

  const images = payload.images || []; // [{ mimeType: "image/png", data: "base64..." }, ...]
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
