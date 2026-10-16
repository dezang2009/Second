// 시작점
(function (KM) {
  'use strict';
  function boot() {
    KM.UI.init();
    if (!KM.BUNDLE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시는 선택 사항 */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.KM || (globalThis.KM = {}));
