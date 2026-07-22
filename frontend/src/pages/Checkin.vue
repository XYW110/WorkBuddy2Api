<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { ApiError } from "../api/client";
import {
  getCheckinStatus,
  listCheckinHistory,
  runCheckin,
} from "../api/checkin";
import type {
  CheckinHistoryRecord,
  CheckinResult,
  CheckinStatusData,
} from "../api/types";

const statusLoading = ref(false);
const checkinLoading = ref(false);
const historyLoading = ref(false);

const statusData = ref<CheckinStatusData | null>(null);
const statusError = ref("");
const lastResult = ref<CheckinResult | null>(null);

const historyItems = ref<CheckinHistoryRecord[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = ref(20);

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "请求失败";
}

function isCheckinResult(v: unknown): v is CheckinResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "success" in v &&
    "skipped" in v &&
    "executedAt" in v
  );
}

const status = computed(() => statusData.value?.status);

async function loadStatus() {
  statusLoading.value = true;
  statusError.value = "";
  try {
    statusData.value = await getCheckinStatus();
  } catch (e) {
    statusData.value = null;
    statusError.value = errMsg(e);
  } finally {
    statusLoading.value = false;
  }
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    const data = await listCheckinHistory({
      page: historyPage.value,
      pageSize: historyPageSize.value,
    });
    historyItems.value = data.items;
    historyTotal.value = data.total;
    historyPage.value = data.page;
    historyPageSize.value = data.pageSize;
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    historyLoading.value = false;
  }
}

async function onRunCheckin() {
  checkinLoading.value = true;
  try {
    const result = await runCheckin();
    lastResult.value = result;
    if (result.skipped) {
      ElMessage.success(result.reason || "今日已签到（跳过）");
    } else if (result.success) {
      ElMessage.success(result.reason || "签到成功");
    } else {
      ElMessage.warning(result.reason || "签到未成功");
    }
    await Promise.all([loadStatus(), loadHistory()]);
  } catch (e) {
    if (e instanceof ApiError && isCheckinResult(e.data)) {
      lastResult.value = e.data;
      ElMessage.error(e.message || e.data.reason || "签到失败");
      await loadHistory();
    } else {
      ElMessage.error(errMsg(e));
    }
  } finally {
    checkinLoading.value = false;
  }
}

function onHistoryPageChange(p: number) {
  historyPage.value = p;
  void loadHistory();
}

function onHistorySizeChange(s: number) {
  historyPageSize.value = s;
  historyPage.value = 1;
  void loadHistory();
}

function sourceLabel(s: string): string {
  if (s === "manual") return "手动";
  if (s === "scheduled") return "调度";
  if (s === "script") return "脚本";
  return s;
}

function resultTagType(row: { success: boolean; skipped: boolean }) {
  if (row.skipped) return "info";
  return row.success ? "success" : "danger";
}

function resultLabel(row: { success: boolean; skipped: boolean }) {
  if (row.skipped) return "跳过";
  return row.success ? "成功" : "失败";
}

onMounted(() => {
  void loadStatus();
  void loadHistory();
});
</script>

<template>
  <div class="page-checkin">
    <div class="toolbar">
      <h2>签到</h2>
      <div class="actions">
        <el-button
          :loading="statusLoading || historyLoading"
          @click="
            () => {
              loadStatus();
              loadHistory();
            }
          "
        >
          刷新
        </el-button>
        <el-button
          type="primary"
          :loading="checkinLoading"
          @click="onRunCheckin"
        >
          立即签到
        </el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card v-loading="statusLoading" shadow="never" class="block">
          <template #header>
            <span>当前状态</span>
          </template>
          <el-alert
            v-if="statusError"
            type="error"
            :closable="false"
            :title="statusError"
            class="mb"
          />
          <template v-else-if="statusData">
            <p>
              <strong>凭证：</strong>{{ statusData.credentialName }} ({{
                statusData.credentialId
              }})
            </p>
            <el-descriptions v-if="status" :column="1" border size="small">
              <el-descriptions-item label="今日已签">
                {{ status.today_checked_in ? "是" : "否" }}
              </el-descriptions-item>
              <el-descriptions-item label="连续天数">
                {{ status.streak_days ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="总积分">
                {{ status.total_credits ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="今日积分">
                {{ status.today_credit ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="每日积分">
                {{ status.daily_credit ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="活动中">
                {{ status.active ? "是" : "否" }}
              </el-descriptions-item>
            </el-descriptions>
            <el-empty v-else description="暂无状态明细" :image-size="64" />
          </template>
          <el-empty v-else description="暂无状态" :image-size="64" />
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="block">
          <template #header>
            <span>最近一次签到结果</span>
          </template>
          <template v-if="lastResult">
            <el-tag :type="resultTagType(lastResult)" class="mb">
              {{ resultLabel(lastResult) }}
            </el-tag>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="原因">
                {{ lastResult.reason || "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="积分">
                {{ lastResult.credit ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="连续天数">
                {{ lastResult.streakDays ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="总积分">
                {{ lastResult.totalCredits ?? "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="执行时间">
                {{ lastResult.executedAt }}
              </el-descriptions-item>
              <el-descriptions-item label="凭证">
                {{
                  lastResult.credentialName || lastResult.credentialId || "—"
                }}
              </el-descriptions-item>
            </el-descriptions>
          </template>
          <el-empty v-else description="尚未在本页执行签到" :image-size="64" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="block history">
      <template #header>
        <span>签到历史</span>
      </template>
      <el-table
        v-loading="historyLoading"
        :data="historyItems"
        stripe
        border
        row-key="id"
      >
        <el-table-column prop="executedAt" label="时间" min-width="170" />
        <el-table-column label="来源" width="90">
          <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row)" size="small">{{
              resultLabel(row)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="reason"
          label="原因"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column prop="credit" label="积分" width="80" />
        <el-table-column prop="streakDays" label="连续" width="80" />
        <el-table-column
          prop="credentialName"
          label="凭证"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="historyTotal"
          :current-page="historyPage"
          :page-size="historyPageSize"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="onHistoryPageChange"
          @size-change="onHistorySizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page-checkin {
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
}
.block {
  margin-bottom: 16px;
}
.history {
  margin-top: 0;
}
.mb {
  margin-bottom: 12px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
