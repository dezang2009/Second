import { defineConfig } from "vitest/config";

// Capacitor는 앱 안에서 파일을 상대 경로로 불러오므로 base를 "./"로 둔다
export default defineConfig({
  base: "./",
  // life/는 따로 빌드하고 테스트하는 인생 시뮬레이션 게임
  test: { exclude: ["**/node_modules/**", "life/**"] },
});
