import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import App from "./App.vue";
import router from "./router";
import { useConfigStore } from "./stores/config";

const pinia = createPinia();
const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(ElementPlus);

// 启动前加载 runtime config / feature flags，供守卫与 NavMenu 使用
await useConfigStore(pinia).init();
app.mount("#app");
