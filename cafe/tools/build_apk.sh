#!/usr/bin/env bash
# CAfe 안드로이드 APK 빌드 (Gradle 없이 SDK 도구만 사용)
#   필요: JDK, Android build-tools 34, platform android-34
#   사용: ANDROID_SDK=/opt/android-sdk cafe/tools/build_apk.sh
#   결과: cafe/dist/CAfe.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:-/opt/android-sdk}"
BT="${ANDROID_BUILD_TOOLS:-$SDK/build-tools/34.0.0}"
JAR="${ANDROID_JAR:-$SDK/platforms/android-34/android.jar}"
KS="${KEYSTORE:-$ROOT/android/release.keystore}"
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-0.2-beta}"
OUT="$ROOT/dist"
B="$(mktemp -d)"
trap 'rm -rf "$B"' EXIT
mkdir -p "$OUT" "$B/assets/www" "$B/gen" "$B/classes" "$B/dex"

# 1) 게임 파일과 리소스
cp "$ROOT/index.html" "$ROOT/style.css" "$B/assets/www/"
cp -r "$ROOT/src" "$ROOT/fonts" "$B/assets/www/"
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$B/res.zip"
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
  keytool -genkeypair -keystore "$KS" -storepass cafebeta -keypass cafebeta -alias cafe \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=CAfe" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:cafebeta --key-pass pass:cafebeta --ks-key-alias cafe \
  --out "$OUT/CAfe.apk" "$B/aligned.apk"
"$BT/apksigner" verify --verbose "$OUT/CAfe.apk" | head -4
ls -la "$OUT/CAfe.apk"
