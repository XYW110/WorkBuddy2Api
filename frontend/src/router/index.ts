import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { getAdminToken } from "../api/client";
import type { AdminUiFeatures } from "../config/schema";

declare module "vue-router" {
  interface RouteMeta {
    guest?: boolean;
    requiresAuth?: boolean;
    feature?: keyof AdminUiFeatures;
  }
}

// 业务页空壳：§5 仅路由结构；§6 实现具体功能。
const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("../pages/Login.vue"),
    meta: { guest: true },
  },
  {
    path: "/",
    name: "Layout",
    component: () => import("../pages/Layout.vue"),
    meta: { requiresAuth: true },
    redirect: "/credentials",
    children: [
      {
        path: "credentials",
        name: "Credentials",
        component: () => import("../pages/Credentials.vue"),
      },
      {
        path: "api-keys",
        name: "ApiKeys",
        component: () => import("../pages/ApiKeys.vue"),
        meta: { feature: "apiKeys" },
      },
      {
        path: "checkin",
        name: "Checkin",
        component: () => import("../pages/Checkin.vue"),
        meta: { feature: "checkin" },
      },
      {
        path: "quota",
        name: "Quota",
        component: () => import("../pages/Quota.vue"),
        meta: { feature: "quota" },
      },
      {
        path: "models",
        name: "Models",
        component: () => import("../pages/Models.vue"),
        meta: { feature: "models" },
      },
      {
        path: "stats",
        name: "Stats",
        component: () => import("../pages/Stats.vue"),
        meta: { feature: "stats" },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/login",
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // client 拦截器可能只清了 localStorage，同步 store 避免假登录态
  if (auth.token && !getAdminToken()) {
    auth.logout();
  }

  // 有 token 但尚未验证 → 尝试恢复会话
  if (auth.token && !auth.verified) {
    await auth.restoreSession();
  }

  // 需要鉴权但未认证 → 跳登录
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "Login" };
  }

  // 已认证访问 guest 页（登录页）→ 跳主页
  if (to.meta.guest && auth.isAuthenticated) {
    return { path: "/" };
  }

  // feature flag 关闭 → 踢回主页
  if (to.meta.feature) {
    const { config } = useConfigStore();
    const key = to.meta.feature as keyof AdminUiFeatures;
    if (!config.features[key]) {
      return { path: "/" };
    }
  }
});

export default router;
