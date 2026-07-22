<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { ApiError } from "../api/client";
import { getActiveQuota } from "../api/quota";
import type { AdminQuotaData, QuotaParsed } from "../api/types";

const loading = ref(false);
const data = ref<AdminQuotaData | null>(null);
const errorMsg = ref("");
const isNoActive = ref(false);
const showRaw = ref(false);
const activeCollapse = computed(() => (showRaw.value ? ["raw"] : []));

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "请求失败";
}

const parsed = computed<QuotaParsed | null>(
  () => data.value?.quota?.parsed ?? null
);

const rawText = computed(() => {
  if (!data.value?.quota?.raw) return "";
  try {
    return JSON.stringify(data.value.quota.raw, null, 2);
  } catch {
    return String(data.value.quota.raw);
  }
});

/** 状态标签 */
function statusLabel(status: number): string {
  return status === 0 ? "可用" : status === 3 ? "已用完" : `状态 ${status}`;
}

function statusType(status: number): "" | "success" | "warning" | "danger" {
  if (status === 0) return "success";
  if (status === 3) return "warning";
  return "";
}

/** 格式化大数字（如 100000 → 100,000） */
function fmtNum(s: string): string {
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  return n.toLocaleString();
}

async function load() {
  loading.value = true;
  errorMsg.value = "";
  isNoActive.value = false;
  data.value = null;
  try {
    data.value = await getActiveQuota();
  } catch (e) {
    if (e instanceof ApiError && e.code === 404) {
      isNoActive.value = true;
      errorMsg.value = e.message || "无活跃凭证";
    } else {
      errorMsg.value = errMsg(e);
      ElMessage.error(errorMsg.value);
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page-quota">
    <div class="toolbar">
      <h2>额度查询</h2>
      <el-button :loading="loading" type="primary" @click="load"
        >刷新</el-button
      >
    </div>

    <el-card v-loading="loading" shadow="never">
      <el-empty
        v-if="isNoActive"
        description="无活跃凭证，请先在凭证管理中激活一条凭证"
      />
      <el-alert
        v-else-if="errorMsg && !data"
        type="error"
        :closable="false"
        :title="errorMsg"
      />
      <template v-else-if="data">
        <el-descriptions :column="2" border size="small" class="meta">
          <el-descriptions-item label="凭证 ID">{{
            data.credentialId
          }}</el-descriptions-item>
          <el-descriptions-item label="凭证名称">{{
            data.credentialName || "—"
          }}</el-descriptions-item>
        </el-descriptions>

        <!-- 结构化展示 -->
        <template v-if="parsed">
          <el-row :gutter="12" class="summary-row">
            <el-col :span="8">
              <el-statistic
                title="总额度"
                :value="fmtNum(parsed.totalAmount)"
              />
            </el-col>
            <el-col :span="8">
              <el-statistic title="已使用" :value="fmtNum(parsed.totalUsed)" />
            </el-col>
            <el-col :span="8">
              <el-statistic
                title="剩余"
                :value="fmtNum(parsed.totalRemaining)"
              />
            </el-col>
          </el-row>

          <h3 class="sub">资源包明细（{{ parsed.totalCount }} 个）</h3>
          <el-table
            :data="parsed.resources"
            size="small"
            stripe
            border
            class="res-table"
          >
            <el-table-column prop="packageName" label="名称" min-width="120">
              <template #default="{ row }">
                {{ row.packageName || "—" }}
              </template>
            </el-table-column>
            <el-table-column
              prop="packageTotal"
              label="总量"
              width="100"
              align="right"
            >
              <template #default="{ row }">{{
                fmtNum(row.packageTotal)
              }}</template>
            </el-table-column>
            <el-table-column
              prop="packageUsed"
              label="已用"
              width="100"
              align="right"
            >
              <template #default="{ row }">{{
                fmtNum(row.packageUsed)
              }}</template>
            </el-table-column>
            <el-table-column
              prop="packageRemaining"
              label="剩余"
              width="100"
              align="right"
            >
              <template #default="{ row }">{{
                fmtNum(row.packageRemaining)
              }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)" size="small">{{
                  statusLabel(row.status)
                }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="expireTime"
              label="过期时间"
              min-width="160"
            />
          </el-table>
        </template>

        <!-- 解析失败提示 -->
        <el-alert
          v-else
          type="warning"
          :closable="false"
          show-icon
          title="无法解析额度结构化数据，请查看原始 JSON 确认上游响应格式"
          class="parse-warn"
        />

        <!-- 原始 JSON 折叠 -->
        <el-collapse v-model="activeCollapse" class="raw-collapse">
          <el-collapse-item title="原始 JSON（备查）" name="raw">
            <pre class="json-block">{{ rawText }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>
      <el-empty v-else-if="!loading" description="暂无数据" />
    </el-card>
  </div>
</template>

<style scoped>
.page-quota {
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
.meta {
  margin-bottom: 16px;
}
.summary-row {
  margin-bottom: 16px;
}
.sub {
  margin: 0 0 8px;
  font-size: 14px;
  color: #606266;
}
.res-table {
  margin-bottom: 16px;
}
.parse-warn {
  margin-bottom: 12px;
}
.raw-collapse {
  margin-top: 8px;
}
.json-block {
  margin: 0;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  max-height: 400px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
