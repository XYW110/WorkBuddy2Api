/**
 * 凭证导出/导入 round-trip 断言脚本（纯函数，无需启动服务）。
 * 运行: cd backend && npx tsx test/credentials.unit.ts
 * 通过 DATA_DIR 将存储重定向到临时目录，避免污染真实 credentials.json。
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在 import credential-store 之前设置，使其 getCredentialStorePath() 指向临时目录
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cred-test-"));

import type { Credential, CredentialStore } from "../src/types/credential.js";
import { getStore, importStore, getActive } from "../src/services/credential-store.js";

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

const c1: Credential = {
  id: "id-1",
  name: "api1",
  type: "api-key",
  key: "ck_old",
  isActive: true,
  source: "manual",
};
const c2: Credential = {
  id: "id-2",
  name: "local1",
  type: "local-file",
  accessToken: "at-2",
  refreshToken: "rt-2",
  uid: "uid-2",
  isActive: false,
  source: "manual",
};

// 1) 首次导入：新增两条，activeId=id-1
const snap1: CredentialStore = { credentials: [c1, c2], activeId: "id-1" };
const r1 = importStore(snap1);
check("首次导入 added=2", r1.added === 2 && r1.updated === 0, JSON.stringify(r1));
check("store 含 2 条", getStore().credentials.length === 2, `len=${getStore().credentials.length}`);
check("activeId 还原为 id-1", getActive()?.id === "id-1", `active=${getActive()?.id}`);

// 2) 合并去重：id-1 字段更新 + 新增 id-3，activeId 切到 id-3
const c1mod: Credential = { ...c1, key: "ck_new", isActive: false };
const c3: Credential = {
  id: "id-3",
  name: "api3",
  type: "api-key",
  key: "ck-3",
  isActive: true,
  source: "manual",
};
const r2 = importStore({ credentials: [c1mod, c3], activeId: "id-3" });
check("合并 added=1 updated=1", r2.added === 1 && r2.updated === 1, JSON.stringify(r2));
check("store 含 3 条", getStore().credentials.length === 3, `len=${getStore().credentials.length}`);
const storedC1 = getStore().credentials.find((c) => c.id === "id-1")!;
check("id-1 key 已更新", storedC1.key === "ck_new", `key=${storedC1.key}`);
check("activeId 切到 id-3", getActive()?.id === "id-3", `active=${getActive()?.id}`);

// 3) activeId 不存在时不崩溃，保持现有活跃态
const r3 = importStore({ credentials: [c1mod], activeId: "no-such-id" });
check("无效 activeId 不崩溃", r3.added === 0 && r3.updated === 1, JSON.stringify(r3));
check("活跃态保持 id-3", getActive()?.id === "id-3", `active=${getActive()?.id}`);

// 4) round-trip：导出快照可被再次导入且等价
const exported = getStore();
const beforeIds = exported.credentials.map((c) => c.id).sort();
const r4 = importStore({
  credentials: exported.credentials,
  activeId: exported.activeId,
});
const afterIds = getStore().credentials.map((c) => c.id).sort();
check("round-trip 后条数不变", r4.added === 0 && r4.updated === 3, JSON.stringify(r4));
check(
  "round-trip id 集合等价",
  JSON.stringify(beforeIds) === JSON.stringify(afterIds),
  `${beforeIds} vs ${afterIds}`
);

const failed = cases.filter((c) => !c.pass).length;
console.log(`\n${cases.length - failed}/${cases.length} 通过`);
process.exitCode = failed === 0 ? 0 : 1;
