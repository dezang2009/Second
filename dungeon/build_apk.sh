#!/usr/bin/env bash
# 심연의 계단 APK 빌드 (Gradle 없이 Android SDK 도구만 사용)
#   필요: JDK, Android build-tools(aapt2·d8·zipalign·apksigner), platform android.jar
#   사용: ANDROID_BUILD_TOOLS=/path/to/build-tools ANDROID_JAR=/path/to/android.jar dungeon/build_apk.sh
#   결과: dungeon/dist/AbyssStairs.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BT="${ANDROID_BUILD_TOOLS:?build-tools 경로를 ANDROID_BUILD_TOOLS로 지정하세요}"
JAR="${ANDROID_JAR:?android.jar 경로를 ANDROID_JAR로 지정하세요}"
KS="${KEYSTORE:-$ROOT/android/release.keystore}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
OUT="$ROOT/dist"
B="$(mktemp -d)"
trap 'rm -rf "$B"' EXIT
mkdir -p "$OUT" "$B/assets/www" "$B/gen" "$B/classes" "$B/dex"

# 1) 리소스와 게임 파일
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$B/res.zip"
cp -r "$ROOT/web/." "$B/assets/www/"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" --manifest "$ROOT/android/AndroidManifest.xml" \
  --java "$B/gen" -A "$B/assets" --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$B/res.zip"

# 2) 코드
javac --release 8 -nowarn -Xlint:-options -cp "$JAR" -d "$B/classes" \
  $(find "$ROOT/android/src" "$B/gen" -name '*.java') 2>&1 | grep -v '^warning' || true
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$B/dex" $(find "$B/classes" -name '*.class')
(cd "$B/dex" && zip -q -j "$B/base.apk" classes.dex)

# 3) 정렬과 서명 (키가 없으면 처음 한 번 만든다. 같은 키로 서명해야 업데이트 설치가 된다)
"$BT/zipalign" -f -p 4 "$B/base.apk" "$B/aligned.apk"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass abyss123 -keypass abyss123 -alias abyss \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Abyss Stairs" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:abyss123 --key-pass pass:abyss123 --ks-key-alias abyss \
  --out "$OUT/AbyssStairs.apk" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT/AbyssStairs.apk"
ls -la "$OUT/AbyssStairs.apk"
