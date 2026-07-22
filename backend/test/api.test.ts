/**
 * API 端到端测试脚本
 * 测试前确保服务已启动: cd backend && node --import tsx src/index.ts
 * 运行: cd backend && node --import tsx test/api.test.ts
 */

const BASE = "http://127.0.0.1:3000";

// admin 鉴权 token（优先读环境变量，本地兜底 test-token-123）
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "test-token-123";

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${name}: ${detail}`);
}

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function post(
  path: string,
  data: any
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
    },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function put(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function del(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("=".repeat(60));
  console.log("WorkBuddy2Api 端到端测试");
  console.log("=".repeat(60));
  console.log();

  // ──── 1. 健康检查 ────
  console.log("── 1. 健康检查 ──");
  {
    const { status, body } = await get("/health");
    record("GET /health 返回 200", status === 200, `status=${status}`);
    record(
      "GET /health 内容正确",
      body?.status === "ok",
      `body=${JSON.stringify(body)}`
    );
  }
  console.log();

  // ──── 2. 模型列表 ────
  console.log("── 2. 模型列表 ──");
  {
    const { status, body } = await get("/v1/models");
    record("GET /v1/models 返回 200", status === 200, `status=${status}`);
    record(
      "GET /v1/models object=list",
      body?.object === "list",
      `object=${body?.object}`
    );
    record(
      "GET /v1/models 有模型数据",
      Array.isArray(body?.data) && body.data.length >= 2,
      `模型数=${body?.data?.length}`
    );
  }
  console.log();

  // ──── 3. 凭证管理 ────
  console.log("── 3. 凭证管理 ──");
  let addedId: string | null = null;
  let localId: string | null = null;

  // 3.0 管理鉴权反向用例：不带 token 预期 401
  {
    const res = await fetch(`${BASE}/admin/credentials`);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    record(
      "GET /admin/credentials 无 token 返回 401",
      res.status === 401 && body?.code === 401,
      `status=${res.status}, code=${body?.code}`
    );
  }

  // 3.1 列出凭证
  {
    const { status, body } = await get("/admin/credentials");
    record(
      "GET /admin/credentials 返回 200 envelope",
      status === 200 && body?.code === 200,
      `status=${status}, code=${body?.code}`
    );
    const d = body?.data;
    const hasCreds = Array.isArray(d?.items) && d.items.length > 0;
    record(
      "GET /admin/credentials 有凭证列表",
      hasCreds,
      `凭证数=${d?.items?.length}`
    );
    if (hasCreds) {
      localId = d.items[0].id;
      record(
        "GET /admin/credentials 含 activeId",
        d?.activeId !== null && d?.activeId !== undefined,
        `activeId=${d?.activeId}`
      );
    }
  }

  // 3.2 添加凭证
  {
    const { status, body } = await post("/admin/credentials", {
      name: "测试 Key",
      key: "ck_test_key_12345",
    });
    record(
      "POST /admin/credentials 返回 201 envelope",
      status === 201 && body?.code === 201,
      `status=${status}, code=${body?.code}`
    );
    const c = body?.data;
    const hasId = c?.id && c?.type === "api-key";
    record(
      "POST /admin/credentials 返回凭证对象",
      hasId,
      `id=${c?.id}, type=${c?.type}`
    );
    if (hasId) addedId = c.id;
  }

  // 3.3 切换活跃凭证
  if (addedId) {
    const { status, body } = await put(
      `/admin/credentials/${addedId}/activate`
    );
    record(
      "PUT /admin/credentials/:id/activate 返回 200 envelope",
      status === 200 && body?.code === 200,
      `status=${status}, code=${body?.code}`
    );
    const a = body?.data;
    record(
      "PUT /admin/credentials/:id/activate 切换成功",
      a?.success === true && a?.activeId === addedId,
      `success=${a?.success}, activeId=${a?.activeId}`
    );
  }

  // 3.4 切换不存在的凭证
  {
    const { status, body } = await put(
      "/admin/credentials/nonexistent/activate"
    );
    record(
      "PUT /admin/credentials/:id/activate 不存在返回 404",
      status === 404,
      `status=${status}`
    );
  }

  // 3.5 删除凭证
  if (addedId) {
    const { status, body } = await del(`/admin/credentials/${addedId}`);
    record(
      "DELETE /admin/credentials/:id 返回 200 envelope",
      status === 200 && body?.code === 200,
      `status=${status}, code=${body?.code}`
    );
    record(
      "DELETE /admin/credentials/:id 删除成功",
      body?.data?.success === true,
      `success=${body?.data?.success}`
    );

    // 再次删除应返回 404
    const { status: s2 } = await del(`/admin/credentials/${addedId}`);
    record(
      "DELETE /admin/credentials/:id 重复删除返回 404",
      s2 === 404,
      `status=${s2}`
    );
  }

  // 3.6 添加缺少字段的请求
  {
    const { status, body } = await post("/admin/credentials", {
      name: "无 key",
    });
    record(
      "POST /admin/credentials 缺少 key 返回 422 envelope",
      status === 422 && body?.code === 422,
      `status=${status}, code=${body?.code}, message=${body?.message}`
    );
  }
  console.log();

  // ──── 4. 额度查询 ────
  console.log("── 4. 额度查询 ──");
  {
    // 不存在的凭证
    const { status, body } = await get("/admin/credentials/nonexistent/quota");
    record(
      "GET /admin/credentials/:id/quota 不存在返回 404",
      status === 404,
      `status=${status}`
    );
  }
  if (localId) {
    const { status, body } = await get(`/admin/credentials/${localId}/quota`);
    // 上游不可用，预期 502 或 200（取决于网络）
    const acceptable = status === 502 || status === 200;
    record(
      "GET /admin/credentials/:id/quota 路由可用",
      acceptable,
      `status=${status}, body=${JSON.stringify(body).slice(0, 100)}`
    );
  }
  console.log();

  // ──── 5. 聊天补全 ────
  console.log("── 5. 聊天补全 ────");
  {
    // 非流式请求
    const { status, body } = await post("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: "你好" }],
      stream: false,
    });
    // 上游不可用时预期 502
    record(
      "POST /v1/chat/completions 路由可用",
      status === 502 || status === 200,
      `status=${status}`
    );
  }
  {
    // 缺少 messages
    const { status } = await post("/v1/chat/completions", { model: "auto" });
    record(
      "POST /v1/chat/completions 缺少 messages 返回 400",
      status === 400,
      `status=${status}`
    );
  }
  {
    // 无凭证时（把本地凭证删完的情况不测试，跳过）
  }
  console.log();

  // ──── 6. 不存在的路由 ────
  console.log("── 6. 健壮性 ──");
  {
    const { status } = await get("/nonexistent");
    record("GET /nonexistent 返回 404", status === 404, `status=${status}`);
  }
  console.log();

  // ──── 汇总 ────
  console.log("=".repeat(60));
  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.filter((r) => !r.pass).length;
  console.log(
    `总计: ${results.length} 项 | 通过: ${passCount} ✅ | 失败: ${failCount} ❌`
  );
  console.log("=".repeat(60));

  if (failCount > 0) {
    console.log("\n失败项:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log("\n🎉 所有测试通过！");
  }
}

main().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
