import axios, { type AxiosError, type AxiosInstance } from "axios";

export interface AdminEnvelope<T> {
  code: number;
  message: string;
  data: T | null;
  requestId?: string;
}

export class ApiError extends Error {
  code: number;
  /** envelope.data（签到 502 时可能为 CheckinResult） */
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.data = data;
  }
}

const TOKEN_KEY = "admin_token";

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** 创建 axios 实例；鉴权拦截与 envelope 解包在下一步完整接线 */
export function createApiClient(apiBase = ""): AxiosInstance {
  const client = axios.create({
    baseURL: apiBase || undefined,
    timeout: 30_000,
  });

  client.interceptors.request.use((config) => {
    const token = getAdminToken();
    if (token) {
      config.headers.set("x-admin-token", token);
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      const body = response.data as AdminEnvelope<unknown>;
      if (body && typeof body === "object" && "code" in body) {
        if (body.code === 200 || body.code === 201) {
          return { ...response, data: body.data };
        }
        return Promise.reject(
          new ApiError(
            body.code,
            body.message || "请求失败",
            body.data ?? undefined
          )
        );
      }
      return response;
    },
    (error: AxiosError<AdminEnvelope<unknown>>) => {
      const status = error.response?.status;
      const envelope = error.response?.data;
      const code = envelope?.code ?? status ?? -1;
      const msg = envelope?.message || error.message || "网络错误";
      const data = envelope?.data ?? undefined;

      // 401/503 仅清 token；跳转交由 router.beforeEach 统一处理，
      // 避免 hash 路由下 window.location.assign 打到错误路径。
      if (status === 401 || status === 503) {
        clearAdminToken();
      }

      return Promise.reject(new ApiError(code, msg, data));
    }
  );

  return client;
}

/** 默认单例；baseURL 可由 config store 在启动后替换 */
export const apiClient = createApiClient();
