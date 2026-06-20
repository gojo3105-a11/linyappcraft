import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "my-mini-app", // 콘솔에서 발급받은 appName으로 교체하세요
  brand: {
    displayName: "리니와도리의 가시소동", // 토스 앱에 노출되는 서비스 이름
    primaryColor: "#1976D2", // 화면에 노출되는 앱의 기본 색상
    icon: "", // 콘솔에서 업로드한 아이콘 이미지 URL을 붙여넣으세요
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
