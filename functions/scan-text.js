// functions/scan-text.js
//
// watch.html(화면 지속 감시 도구)에서 호출하는 OCR 함수.
// - 기본(text) 모드: 이미지에 보이는 텍스트를 그대로 읽어서 돌려준다.
// - 구조화(structured) 모드: 사용자가 지정한 필드명(예: "품목명,도시명")으로
//   화면에 반복되는 항목들을 표 형태(JSON 행 배열)로 뽑아서 돌려준다.

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

const MODEL = "gemini-3.1-flash-lite";

const TEXT_PROMPT = `이 이미지에 보이는 텍스트를 전부, 화면에 배치된 순서(위에서 아래, 왼쪽에서 오른쪽)대로 있는 그대로 읽어서 돌려줘.
설명이나 해석을 덧붙이지 말고, 보이는 텍스트만 줄바꿈으로 구분해서 답해라. 텍스트가 전혀 없으면 빈 문자열로 답해라.`;

function buildStructuredPrompt(fields) {
  const fieldList = fields.map(f => `"${f}"`).join(", ");
  return `이 이미지에서 반복되는 항목들을 찾아서, 아래 JSON 형식으로만 답하라 (다른 설명, 코드블록 표시 없이 JSON 텍스트만):

{ "rows": [ { ${fields.map(f => `"${f}": "값"`).join(", ")} }, ... ] }

각 행은 다음 필드를 가져야 한다: ${fieldList}
화면에 보이는 내용을 기준으로 각 항목(행)을 정확히 구분해서 채워라. 해당하는 값이 안 보이면 빈 문자열로 둬라.
항목이 하나도 없으면 rows를 빈 배열로 답하라.`;
}

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

  const mode = payload.mode === "structured" ? "structured" : "text";
  const fields = Array.isArray(payload.fields) ? payload.fields.filter(Boolean) : [];
  if (mode === "structured" && fields.length === 0) {
    return jsonResponse({ ok: false, error: "구조화 모드는 필드명이 최소 1개 필요합니다." }, 400);
  }

  const prompt = mode === "structured" ? buildStructuredPrompt(fields) : TEXT_PROMPT;
  const generationConfig = mode === "structured" ? { response_mime_type: "application/json" } : undefined;

  try {
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: image.mimeType, data: image.data } },
        ],
      }],
    };
    if (generationConfig) body.generationConfig = generationConfig;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

    if (mode === "structured") {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return jsonResponse({ ok: false, error: "AI 응답이 JSON 형식이 아닙니다.", raw: text }, 502);
      }
      return jsonResponse({ ok: true, rows: parsed.rows || [] }, 200);
    }

    return jsonResponse({ ok: true, text: text.trim() }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
}
