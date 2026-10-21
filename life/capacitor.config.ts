import type { CapacitorConfig } from "@capacitor/cli";

// 리듬게임(com.dezang.rhythm)과 다른 앱 ID라 폰에 둘 다 따로 설치된다
const config: CapacitorConfig = {
  appId: "com.dezang.life",
  appName: "한 번뿐인 인생",
  webDir: "dist",
};

export default config;
