// usage-log.js
//
// watch.html, mw.html 등에서 Gemini/Claude API를 호출하기 직전에 logApiUsage(model)을 불러서
// 이 브라우저(같은 도메인)의 localStorage에 {model, ts} 기록을 남긴다.
// monitor.html이 이 기록을 읽어서 모델별 RPM/RPD 근사치를 계산해 보여준다.
//
// 주의: 이건 "이 브라우저에서 이 사이트를 통해 보낸 요청"만 세는 근사치다.
// 다른 기기/브라우저에서 호출했거나, 같은 Google 계정을 다른 앱에서도 쓰고 있다면
// 실제 구글 서버의 한도 소진량과는 다를 수 있다. 정확한 값은 항상
// https://aistudio.google.com/rate-limit 이 기준이다.

const API_USAGE_LOG_KEY = "apiUsageLog_v1";

function logApiUsage(model) {
  try {
    const raw = localStorage.getItem(API_USAGE_LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    log.push({ model: model, ts: Date.now() });
    // 25시간 넘은 기록은 정리 (RPD 계산엔 24시간이면 충분, 여유를 좀 둠)
    const cutoff = Date.now() - 25 * 60 * 60 * 1000;
    const trimmed = log.filter(function (e) { return e.ts >= cutoff; });
    // 과도하게 쌓이지 않도록 최근 5000건까지만 유지
    localStorage.setItem(API_USAGE_LOG_KEY, JSON.stringify(trimmed.slice(-5000)));
  } catch (e) {
    // 저장 실패해도 스캔 기능 자체엔 지장 없도록 조용히 무시
  }
}
