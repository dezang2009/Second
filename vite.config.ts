import { defineConfig } from "vite";

// Capacitor는 앱 안에서 파일을 상대 경로로 불러오므로 base를 "./"로 둔다
export default defineConfig({
  base: "./",
});
