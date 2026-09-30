import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// APK(Capacitor) 빌드 시에는 로컬 파일에서 로드되므로 base '/'
// GitHub Pages 웹 배포 시에는 '/linyappcraft/'
const forCap = process.env.CAP === "1";

export default defineConfig({
  base: forCap ? "/" : (process.env.GITHUB_ACTIONS ? "/linyappcraft/" : "/"),
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
});
