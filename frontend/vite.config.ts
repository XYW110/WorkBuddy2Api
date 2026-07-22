import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 开发期通过 Vite proxy 转发 /admin 到后端，规避后端 CORS origin:false 限制。
// 后端默认端口 3000，可通过 PORT 环境变量覆盖。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/admin": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
