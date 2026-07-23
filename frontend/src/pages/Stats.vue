<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { fetchUsageStats } from "../api/stats";
import type { UsageEntry } from "../api/types";
import { ElMessage } from "element-plus";

const loading = ref(false);
const entries = ref<UsageEntry[]>([]);
const totalCalls = computed(() =>
  entries.value.reduce((sum, e) => sum + e.callCount, 0)
);
const totalTokens = computed(() =>
  entries.value.reduce((sum, e) => sum + e.promptTokens + e.completionTokens, 0)
);

async function load() {
  loading.value = true;
  try {
    const data = await fetchUsageStats();
    entries.value = data.entries;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载统计失败");
  } finally {
    loading.value = false;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

onMounted(load);
</script>

<template>
  <div class="stats-page">
    <div class="stats-header">
      <h2>API Key 调用统计</h2>
      <el-button :loading="loading" @click="load" size="small">刷新</el-button>
    </div>

    <div class="stats-summary">
      <el-tag type="primary">总调用次数：{{ totalCalls }}</el-tag>
      <el-tag type="success">总 Token：{{ formatTokens(totalTokens) }}</el-tag>
    </div>

    <el-table
      :data="entries"
      v-loading="loading"
      stripe
      border
      empty-text="暂无调用记录"
    >
      <el-table-column prop="credentialName" label="Key 名称" min-width="120" />
      <el-table-column prop="model" label="模型" min-width="160" />
      <el-table-column
        prop="callCount"
        label="调用次数"
        width="100"
        align="right"
        sortable
      />
      <el-table-column label="Prompt Token" width="120" align="right" sortable sort-by="promptTokens">
        <template #default="{ row }">
          {{ formatTokens(row.promptTokens) }}
        </template>
      </el-table-column>
      <el-table-column label="Completion Token" width="140" align="right" sortable sort-by="completionTokens">
        <template #default="{ row }">
          {{ formatTokens(row.completionTokens) }}
        </template>
      </el-table-column>
      <el-table-column label="总 Token" width="110" align="right" sortable sort-by="totalTokens">
        <template #default="{ row }">
          <strong>{{ formatTokens(row.promptTokens + row.completionTokens) }}</strong>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.stats-page {
  max-width: 1000px;
}
.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.stats-header h2 {
  margin: 0;
}
.stats-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
</style>
