import { DEFAULT_UI_CONFIG, type AdminUiConfig } from "./schema";

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value !== "false" && value !== "0";
}

/** 从 VITE_* 构建默认配置 */
export function loadEnvConfig(): AdminUiConfig {
  return {
    apiBase: import.meta.env.VITE_API_BASE ?? DEFAULT_UI_CONFIG.apiBase,
    brandName: import.meta.env.VITE_BRAND_NAME ?? DEFAULT_UI_CONFIG.brandName,
    pageTitle: import.meta.env.VITE_PAGE_TITLE ?? DEFAULT_UI_CONFIG.pageTitle,
    features: {
      checkin: envFlag(import.meta.env.VITE_FEATURE_CHECKIN, true),
      quota: envFlag(import.meta.env.VITE_FEATURE_QUOTA, true),
      apiKeys: envFlag(import.meta.env.VITE_FEATURE_API_KEYS, true),
      models: envFlag(import.meta.env.VITE_FEATURE_MODELS, true),
      stats: envFlag(import.meta.env.VITE_FEATURE_STATS, true),
    },
  };
}

/**
 * 尝试拉取 /admin-ui-config.json 覆盖构建期配置。
 * 404/网络失败时静默回落，不抛错。
 */
export async function loadRuntimeConfig(): Promise<AdminUiConfig> {
  const base = loadEnvConfig();
  try {
    const res = await fetch("/admin-ui-config.json", { cache: "no-store" });
    if (!res.ok) return base;
    const json = (await res.json()) as Partial<AdminUiConfig>;
    return {
      apiBase: json.apiBase ?? base.apiBase,
      brandName: json.brandName ?? base.brandName,
      pageTitle: base.pageTitle,
      features: {
        checkin: json.features?.checkin ?? base.features.checkin,
        quota: json.features?.quota ?? base.features.quota,
        apiKeys: json.features?.apiKeys ?? base.features.apiKeys,
        models: json.features?.models ?? base.features.models,
        stats: json.features?.stats ?? base.features.stats,
      },
    };
  } catch {
    return base;
  }
}

export type { AdminUiConfig, AdminUiFeatures } from "./schema";
export { DEFAULT_UI_CONFIG } from "./schema";
