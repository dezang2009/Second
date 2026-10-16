// 단일 HTML 파일로 묶기: node tools/build.js
//  - dist/kickoff-manager.html : 더블클릭으로 바로 열 수 있는 완성본
//  - dist/artifact.html        : 문서 골격 없이 본문만 담은 버전 (임베드/호스팅용)
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
${body}
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/kickoff-manager.html'), full);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);
console.log('dist/kickoff-manager.html', (full.length / 1024).toFixed(0) + 'KB');
