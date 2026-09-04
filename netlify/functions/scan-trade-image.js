// netlify/functions/scan-trade-image.js
//
// mw.html(관리자 페이지)의 "AI 스캔 등록"에서 호출하는 서버리스 함수.
// 클라이언트가 이미지(base64)를 보내면, Gemini Vision API로 분석해서
// { itemName, rows: [{city, price, marketRate}] } 형태로 돌려준다.
//
// GEMINI_API_KEY는 Netlify 대시보드의 환경변수로만 등록하고, 코드에는 절대 넣지 않는다.

const MODEL = "gemini-2.0-flash";

const PROMPT = `다음은 "대항해시대 오리진(Uncharted Waters Origin)" 게임의 교역품 도시별 판매가 목록 스크린샷이다.
이미지에서 정보를 추출해서 아래 JSON 형식으로만 답하라 (다른 설명, 코드블록 표시 없이 JSON 텍스트만):

{
  "itemName": "화면에서 선택/강조된 교역품 이름. 안 보이면 null",
  "rows": [
    { "city": "도시명(한글)", "price": 정수(쉼표 제거한 전체 판매가), "marketRate": 정수(시세 퍼센트의 숫자만, % 기호 제외) }
  ]
}

여러 장의 이미지가 함께 주어지면 모든 도시를 rows 배열 하나에 합쳐라. 같은 도시가 여러 이미지에 중복 등장하면 한 번만 포함하라.
"관세"나 "행사" 열은 무시하고 도시명/시세/전체 판매가만 추출하라.`;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "잘못된 요청 본문" }) };
  }

  const images = payload.images || []; // [{ mimeType: "image/png", data: "base64..." }, ...]
  if (images.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "이미지가 없습니다." }) };
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
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, error: "AI 응답을 이해하지 못했습니다.", raw: json }),
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: "AI 응답이 JSON 형식이 아닙니다.", raw: text }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, data: parsed }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
