<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { ApiError } from "../api/client";
import {
  listCredentials,
  createCredential,
  uploadCredential,
  deleteCredential,
  activateCredential,
  getCredentialQuota,
  exportCredentials,
  importCredentials,
} from "../api/credentials";
import type { AdminQuotaData, Credential, QuotaParsed } from "../api/types";

const loading = ref(false);
const items = ref<Credential[]>([]);
const activeId = ref<string | null>(null);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const createVisible = ref(false);
const createSubmitting = ref(false);
const createForm = reactive({ name: "", key: "" });

const uploadSubmitting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const exportSubmitting = ref(false);
const importSubmitting = ref(false);
const importFileInputRef = ref<HTMLInputElement | null>(null);

const quotaVisible = ref(false);
const quotaLoading = ref(false);
const quotaData = ref<AdminQuotaData | null>(null);

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "请求失败";
}

async function load() {
  loading.value = true;
  try {
    const data = await listCredentials({
      page: page.value,
      pageSize: pageSize.value,
    });
    items.value = data.items;
    total.value = data.total;
    page.value = data.page;
    pageSize.value = data.pageSize;
    activeId.value = data.activeId;
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    loading.value = false;
  }
}

function onPageChange(p: number) {
  page.value = p;
  void load();
}

function onSizeChange(s: number) {
  pageSize.value = s;
  page.value = 1;
  void load();
}

function secretPreview(cred: Credential): string {
  if (cred.type === "api-key") return cred.key ?? "—";
  return cred.accessToken ?? "—";
}

function showOnceSecret(cred: Credential) {
  const lines: string[] = [
    `名称: ${cred.name}`,
    `类型: ${cred.type}`,
    `ID: ${cred.id}`,
  ];
  if (cred.key) lines.push(`key: ${cred.key}`);
  if (cred.accessToken) lines.push(`accessToken: ${cred.accessToken}`);
  if (cred.refreshToken) lines.push(`refreshToken: ${cred.refreshToken}`);
  if (cred.uid) lines.push(`uid: ${cred.uid}`);
  lines.push("", "请立即复制保存，关闭后列表仅显示脱敏值，无法再次查看明文。");
  void ElMessageBox.alert(lines.join("\n"), "明文密钥（仅此一次）", {
    confirmButtonText: "已复制并关闭",
    type: "warning",
    customClass: "secret-once-box",
  });
}

async function onCreate() {
  if (!createForm.name.trim() || !createForm.key.trim()) {
    ElMessage.warning("请填写名称与 key");
    return;
  }
  createSubmitting.value = true;
  try {
    const cred = await createCredential({
      name: createForm.name.trim(),
      type: "api-key",
      key: createForm.key.trim(),
    });
    createVisible.value = false;
    createForm.name = "";
    createForm.key = "";
    showOnceSecret(cred);
    await load();
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    createSubmitting.value = false;
  }
}

function triggerUpload() {
  fileInputRef.value?.click();
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploadSubmitting.value = true;
  try {
    const cred = await uploadCredential(file);
    showOnceSecret(cred);
    await load();
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    uploadSubmitting.value = false;
  }
}

/** 导出整库快照（含明文密钥）为 credentials-backup.json */
async function onExport() {
  exportSubmitting.value = true;
  try {
    const blob = await exportCredentials();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "credentials-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success("已导出备份文件（含明文密钥，请妥善保管）");
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    exportSubmitting.value = false;
  }
}

function triggerImport() {
  importFileInputRef.value?.click();
}

/** 导入整库快照：按 id 合并去重，并还原活跃态 */
async function onImportFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importSubmitting.value = true;
  try {
    const res = await importCredentials(file);
    ElMessage.success(`导入完成：新增 ${res.added}，更新 ${res.updated}`);
    await load();
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    importSubmitting.value = false;
  }
}

async function onActivate(row: Credential) {
  try {
    await activateCredential(row.id);
    ElMessage.success("已激活");
    await load();
  } catch (e) {
    ElMessage.error(errMsg(e));
  }
}

async function onDelete(row: Credential) {
  try {
    await ElMessageBox.confirm(
      `确认删除凭证「${row.name}」？此操作不可恢复。`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  try {
    await deleteCredential(row.id);
    ElMessage.success("已删除");
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      ElMessage.error(e.message || "不允许删除唯一的本地文件凭证");
      return;
    }
    ElMessage.error(errMsg(e));
  }
}

async function onQuota(row: Credential) {
  quotaVisible.value = true;
  quotaLoading.value = true;
  quotaData.value = null;
  try {
    quotaData.value = await getCredentialQuota(row.id);
  } catch (e) {
    ElMessage.error(errMsg(e));
    quotaVisible.value = false;
  } finally {
    quotaLoading.value = false;
  }
}

function formatQuota(q: AdminQuotaData["quota"] | unknown): string {
  try {
    // 新结构：{ raw, parsed }
    if (q && typeof q === "object" && "raw" in (q as object)) {
      const payload = q as { raw: unknown; parsed: QuotaParsed | null };
      if (payload.parsed) {
        const p = payload.parsed;
        const lines = [
          `总额度: ${p.totalAmount}`,
          `已使用: ${p.totalUsed}`,
          `剩余: ${p.totalRemaining}`,
          `资源包数: ${p.totalCount}`,
          "",
          ...p.resources.map(
            (r, i) =>
              `[${i + 1}] ${r.packageName || r.resourceId || "资源"} | 总量 ${
                r.packageTotal
              } | 已用 ${r.packageUsed} | 剩余 ${r.packageRemaining} | 过期 ${
                r.expireTime || "—"
              }`
          ),
          "",
          "--- 原始 JSON ---",
          JSON.stringify(payload.raw, null, 2),
        ];
        return lines.join("\n");
      }
      return JSON.stringify(payload.raw ?? q, null, 2);
    }
    return JSON.stringify(q, null, 2);
  } catch {
    return String(q);
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page-credentials">
    <div class="toolbar">
      <h2>凭证管理</h2>
      <div class="actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="createVisible = true"
          >添加 API Key 凭证</el-button
        >
        <el-button :loading="uploadSubmitting" @click="triggerUpload"
          >上传 JSON</el-button
        >
        <el-button :loading="exportSubmitting" @click="onExport"
          >导出备份</el-button
        >
        <el-button :loading="importSubmitting" @click="triggerImport"
          >导入备份</el-button
        >
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          class="hidden-file"
          @change="onFileChange"
        />
        <input
          ref="importFileInputRef"
          type="file"
          accept=".json,application/json"
          class="hidden-file"
          @change="onImportFileChange"
        />
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="创建/上传成功仅展示一次明文；列表敏感字段已脱敏。无详情与改名接口。"
      class="hint"
    />

    <el-table v-loading="loading" :data="items" stripe border row-key="id">
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column label="敏感字段" min-width="180">
        <template #default="{ row }">
          <code class="mask">{{ secretPreview(row) }}</code>
        </template>
      </el-table-column>
      <el-table-column label="活跃" width="90" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="row.isActive || row.id === activeId"
            type="success"
            size="small"
          >
            活跃
          </el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="100" />
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="row.isActive || row.id === activeId"
            @click="onActivate(row)"
          >
            激活
          </el-button>
          <el-button link type="primary" @click="onQuota(row)">额度</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-dialog
      v-model="createVisible"
      title="添加 API Key 凭证"
      width="480px"
      destroy-on-close
    >
      <el-form label-width="80px" @submit.prevent="onCreate">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="key" required>
          <el-input
            v-model="createForm.key"
            placeholder="ck_..."
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreate"
          >创建</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="quotaVisible"
      title="凭证额度"
      width="560px"
      destroy-on-close
    >
      <div v-loading="quotaLoading">
        <p v-if="quotaData">credentialId: {{ quotaData.credentialId }}</p>
        <pre class="json-block">{{ formatQuota(quotaData?.quota) }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-credentials {
  padding: 4px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.toolbar h2 {
  margin: 0;
  font-size: 20px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.hint {
  margin-bottom: 12px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.mask {
  font-size: 12px;
  word-break: break-all;
}
.muted {
  color: #909399;
}
.hidden-file {
  display: none;
}
.json-block {
  margin: 0;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
