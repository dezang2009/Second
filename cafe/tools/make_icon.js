// 런처 아이콘 생성: node cafe/tools/make_icon.js  (Playwright의 크롬으로 캔버스를 PNG로 저장)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const data = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 192; c.height = 192;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#3a2d47'; x.fillRect(0, 0, 192, 192);
    const px = [[7, 3, 1, 3, '#cdbfe0'], [10, 2, 1, 3, '#cdbfe0'], [4, 7, 9, 8, '#f6ead7'], [5, 7, 7, 1, '#5a3526'], [13, 9, 2, 4, '#f6ead7'], [3, 15, 11, 1, '#ffcf5c']];
    const u = 192 / 19;
    for (const [a, b2, w, h, col] of px) { x.fillStyle = col; x.fillRect(Math.round((a + 0.5) * u), Math.round((b2 + 0.5) * u), Math.round(w * u), Math.round(h * u)); }
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(__dirname, '../android/res/mipmap/ic_launcher.png'), Buffer.from(data, 'base64'));
  await b.close();
})();
