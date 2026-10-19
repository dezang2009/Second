#!/usr/bin/env bash
# 안드로이드 APK 빌드 (Gradle 없이 SDK 도구만 사용)
#   필요: JDK, Android build-tools 34, platform android-34
#   사용: ANDROID_BUILD_TOOLS=/path/to/build-tools ANDROID_JAR=/path/to/android.jar tools/build_apk.sh
#   결과: dist/KickoffManager.apk
# 먼저 python3 tools/build_assets.py --sprites && node tools/build.js 로 dist/app 을 만들어 둘 것.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT="${ANDROID_BUILD_TOOLS:?build-tools 경로를 ANDROID_BUILD_TOOLS로 지정하세요}"
JAR="${ANDROID_JAR:?android.jar 경로를 ANDROID_JAR로 지정하세요}"
KS="${KEYSTORE:-$ROOT/android/release.keystore}"
VERSION_CODE="${VERSION_CODE:-38}"
VERSION_NAME="${VERSION_NAME:-4.7}"
OUT="$ROOT/dist"
B="$(mktemp -d)"
trap 'rm -rf "$B"' EXIT

[ -f "$OUT/app/index.html" ] || { echo "dist/app 이 없습니다. node tools/build.js 먼저 실행하세요."; exit 1; }

# 1) 리소스
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$B/res.zip"
mkdir -p "$B/assets/www" "$B/gen" "$B/classes" "$B/dex"
cp -r "$OUT/app/." "$B/assets/www/"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" --manifest "$ROOT/android/AndroidManifest.xml" \
  --java "$B/gen" -A "$B/assets" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$B/res.zip"

# 2) 코드
javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath "$JAR" -d "$B/classes" \
  $(find "$ROOT/android/src" "$B/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$B/dex" $(find "$B/classes" -name '*.class')
(cd "$B/dex" && zip -q -j "$B/base.apk" classes.dex)

# 3) 정렬과 서명
"$BT/zipalign" -f -p 4 "$B/base.apk" "$B/aligned.apk"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass kickoff -keypass kickoff -alias kickoff \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kickoff Manager" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:kickoff --key-pass pass:kickoff --ks-key-alias kickoff \
  --out "$OUT/KickoffManager.apk" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT/KickoffManager.apk"
ls -la "$OUT/KickoffManager.apk"
