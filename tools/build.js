// 단일 HTML 파일로 묶기: node tools/build.js
//  - dist/kickoff-manager.html : 더블클릭으로 바로 열 수 있는 완성본 (사진은 트랜스퍼마크트 CDN에서 불러옴)
//  - dist/artifact.html        : 외부 이미지를 쓸 수 없는 환경용. 사진·로고는 dist/assets 스프라이트 사용
//                                (먼저 python3 tools/build_assets.py --sprites 실행)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = 'globalThis.KM = { BUNDLE: true };\n' + scripts.map((f) => `// ── ${f}\n${read(f)}`).join('\n');
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const icon = 'data:image/svg+xml,' + encodeURIComponent(read('icon.svg'));
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const body = `<div id="app"></div>\n<script>\n${safeJs}\n</script>`;
let sprites = null;
try { sprites = fs.readFileSync(path.join(root, 'data/sprites.json'), 'utf8'); } catch (e) { /* 스프라이트 없음 */ }
const artBody = sprites
  ? `<div id="app"></div>\n<script>\n${safeJs.replace('globalThis.KM = { BUNDLE: true };', `globalThis.KM = { BUNDLE: true, SPRITES: ${sprites} };`)}\n</script>`
  : body;
const full = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e1524">
<title>킥오프 매니저</title>
<link rel="icon" href="${icon}">
${fonts}
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;
const artifact = `<title>킥오프 매니저</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
${artBody}
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/kickoff-manager.html'), full);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);
console.log('dist/kickoff-manager.html', (full.length / 1024).toFixed(0) + 'KB');
