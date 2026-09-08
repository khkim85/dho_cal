// functions/scan-text.js
//
// watch.html(화면 지속 감시 도구)에서 호출하는 범용 OCR 함수.
// 특정 데이터 구조를 가정하지 않고, 이미지에 보이는 텍스트를 있는 그대로 읽어서 돌려준다.

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

const MODEL = "gemini-3.1-flash-lite";

const PROMPT = `이 이미지에 보이는 텍스트를 전부, 화면에 배치된 순서(위에서 아래, 왼쪽에서 오른쪽)대로 있는 그대로 읽어서 돌려줘.
설명이나 해석을 덧붙이지 말고, 보이는 텍스트만 줄바꿈으로 구분해서 답해라. 텍스트가 전혀 없으면 빈 문자열로 답해라.`;

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

  const image = payload.image;
  if (!image || !image.data) {
    return jsonResponse({ ok: false, error: "이미지가 없습니다." }, 400);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: image.mimeType, data: image.data } },
            ],
          }],
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

    if (text == null) {
      const apiError = json.error ? (json.error.message || JSON.stringify(json.error)) : null;
      return jsonResponse({ ok: false, error: apiError ? "Gemini API 오류: " + apiError : "AI 응답을 이해하지 못했습니다." }, 502);
    }

    return jsonResponse({ ok: true, text: text.trim() }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
}
