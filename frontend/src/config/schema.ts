/** UI 配置与 feature flags 类型定义（§5 骨架） */
export interface AdminUiFeatures {
  checkin: boolean;
  quota: boolean;
  apiKeys: boolean;
  models: boolean;
}

export interface AdminUiConfig {
  apiBase: string;
  brandName: string;
  pageTitle: string;
  features: AdminUiFeatures;
}

export const DEFAULT_UI_CONFIG: AdminUiConfig = {
  apiBase: "",
  brandName: "WorkBuddy Admin",
  pageTitle: "WorkBuddy Admin",
  features: {
    checkin: true,
    quota: true,
    apiKeys: true,
    models: true,
  },
};
