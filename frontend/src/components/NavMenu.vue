<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useConfigStore } from "../stores/config";
import type { AdminUiFeatures } from "../config/schema";

const route = useRoute();
const { config } = useConfigStore();

interface MenuItem {
  index: string;
  label: string;
  feature?: keyof AdminUiFeatures;
}

const allItems: MenuItem[] = [
  { index: "/credentials", label: "凭证管理" },
  { index: "/api-keys", label: "API Keys", feature: "apiKeys" },
  { index: "/checkin", label: "签到", feature: "checkin" },
  { index: "/quota", label: "额度查询", feature: "quota" },
  { index: "/models", label: "模型列表", feature: "models" },
  { index: "/stats", label: "调用统计", feature: "stats" },
];

const visibleItems = computed(() =>
  allItems.filter((item) => !item.feature || config.features[item.feature])
);

const activeIndex = computed(() => {
  // 根路径高亮 /credentials（默认重定向目标）
  if (route.path === "/") return "/credentials";
  // 匹配子路由路径：/credentials → 选 /credentials, /api-keys → /api-keys
  return route.path;
});
</script>

<template>
  <el-menu router :default-active="activeIndex">
    <el-menu-item
      v-for="item in visibleItems"
      :key="item.index"
      :index="item.index"
    >
      {{ item.label }}
    </el-menu-item>
  </el-menu>
</template>
