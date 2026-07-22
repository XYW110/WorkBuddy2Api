/**
 * 分页解析与切片工具。
 *
 * 约定：
 * - page 默认 1，最小 1
 * - pageSize 默认 20，最小 1，最大 100
 * - 入参可传字符串（来自 query）或数字
 */
export interface ParsedPagination {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 解析 query 中的分页参数，非法值回落默认 */
export function parsePagination(
  rawPage: string | number | undefined,
  rawPageSize: string | number | undefined,
  defaults: { page?: number; pageSize?: number } = {}
): ParsedPagination {
  const page = clampPositiveInt(rawPage, defaults.page ?? 1, 1);
  const pageSize = clampPositiveInt(rawPageSize, defaults.pageSize ?? 20, 1, 100);
  return { page, pageSize };
}

/** 对数组做分页切片 */
export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const start = (page - 1) * pageSize;
  const sliced = start >= total ? [] : items.slice(start, start + pageSize);
  return { items: sliced, total, page, pageSize };
}

function clampPositiveInt(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max?: number
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  const int = Math.floor(n);
  if (max !== undefined && int > max) return max;
  return int;
}
