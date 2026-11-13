# CAfe

픽셀 카페를 키우는 세로 화면 방치형 경영 게임 (베타).

## 실행

```bash
cd cafe && python3 -m http.server 8090   # http://localhost:8090
```

## 구성

- `src/data.js` 밸런스 숫자 (메뉴, 등급, 비용). 조정은 여기서만 합니다.
- `src/game.js` 게임 로직 (손님·바리스타·서버 시뮬레이션, 구매, 오프라인 정산)
- `src/render.js` 픽셀아트 그리기
- `src/main.js` 화면, 입력, 저장
- `tools/sim.js` 밸런스 점검. `node cafe/tools/sim.js` 로 예상 수입 공식과 등급 도달 시간을 확인하고,
  `CAL=1 node cafe/tools/sim.js` 로 목표 시간에 맞는 등급 조건을 다시 계산합니다.

## APK 빌드

```bash
ANDROID_SDK=/opt/android-sdk cafe/tools/build_apk.sh   # cafe/dist/CAfe.apk
```

서명 키(`android/release.keystore`)는 저장소에 올리지 않습니다. 키가 바뀌면 기존 앱을 지우고 다시 설치해야 합니다.

글꼴: Galmuri (SIL OFL 1.1, `fonts/OFL-Galmuri.txt`).
