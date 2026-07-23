/**
 * runCheckinAll 断言脚本（纯函数，无真实网络：凭证均无凭据 → 命中 hasAuth 短路 skip）。
 * 运行: cd backend && npx tsx test/checkin-all.unit.ts
 * 通过 DATA_DIR 将存储重定向到临时目录，避免污染真实 credentials.json / 历史文件。
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "checkin-all-"));
process.env.DATA_DIR = dir;
// 必须在 import credential-store 之前写入，使其 loadStore() 读取到本测试数据
writeFileSync(
  join(dir, "credentials.json"),
  JSON.stringify({
    credentials: [
      { id: "c1", name: "a", type: "api-key", isActive: false, source: "manual" },
      { id: "c2", name: "b", type: "local-file", isActive: true, source: "manual" },
      { id: "c3", name: "c", type: "api-key", isActive: false, source: "manual" },
    ],
    activeId: "c2",
  }),
  "utf-8"
);

const { runCheckinAll } = await import("../src/services/checkin.js");
// credential-store 不在 import 时自动 loadStore（由 server 引导），测试需显式加载
const { loadStore } = await import("../src/services/credential-store.js");
loadStore();

interface Case {
  name: string;
  pass: boolean;
  detail: string;
}
const cases: Case[] = [];
function check(name: string, pass: boolean, detail: string) {
  cases.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}: ${detail}`);
}

const batch = await runCheckinAll("manual");

// 关键：遍历的是 getAll() 的全部 3 条，而非仅 activeId(c2) 的 1 条
check(
  "遍历全部账户（非仅活跃）",
  batch.results.length === 3,
  `results.length=${batch.results.length}`
);

// 无凭据 → 全部 skip，不触网
check(
  "summary.total=3",
  batch.summary.total === 3,
  JSON.stringify(batch.summary)
);
check(
  "summary.skipped=3（无凭据）, checked=0, failed=0",
  batch.summary.skipped === 3 &&
    batch.summary.checked === 0 &&
    batch.summary.failed === 0,
  JSON.stringify(batch.summary)
);

// 每条凭证都被枚举到
const ids = batch.results.map((r) => r.credentialId).sort();
check(
  "覆盖 c1/c2/c3 全部凭证",
  JSON.stringify(ids) === JSON.stringify(["c1", "c2", "c3"]),
  ids.join(",")
);

const failed = cases.filter((c) => !c.pass).length;
console.log(`\n${cases.length - failed}/${cases.length} 通过`);
process.exitCode = failed === 0 ? 0 : 1;
