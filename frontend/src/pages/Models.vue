<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { ApiError } from "../api/client";
import { getModels } from "../api/models";
import { getLeaderboard, refreshLeaderboard } from "../api/leaderboard";
import type { ModelInfo, LeaderboardState } from "../api/types";

const loading = ref(false);
const data = ref<ModelInfo[]>([]);
const errorMsg = ref("");

const lb = ref<LeaderboardState | null>(null);
const lbLoading = ref(false);
const lbRefreshing = ref(false);

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "请求失败";
}

/** 倍率标签类型：免费→success，未定价→info，收费→danger */
function creditsTagType(
  m: ModelInfo
): "success" | "info" | "danger" {
  if (m.creditsNum === 0) return "success";
  if (isNaN(m.creditsNum)) return "info";
  return "danger";
}

/** 将字节数格式化为可读文本 */
function formatBytes(n?: number | null): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 将 token 数格式化为可读文本（K） */
function formatTokens(n?: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/** 能力标签：图片 / 工具调用 / 推理 */
function capabilityTags(m: ModelInfo): { label: string; type: "success" | "warning" | "info" }[] {
  const tags: { label: string; type: "success" | "warning" | "info" }[] = [];
  if (m.supportsImages) tags.push({ label: "图片", type: "success" });
  if (m.supportsToolCall) tags.push({ label: "工具调用", type: "warning" });
  if (m.supportsReasoning) tags.push({ label: "推理", type: "info" });
  return tags;
}

/** 经济别名当前指向的模型名称 */
const aliasTargetName = computed(() => {
  if (!lb.value?.selectedModelId) return "—";
  const hit = data.value.find((m) => m.id === lb.value!.selectedModelId);
  return hit ? `${hit.name} (${hit.id})` : lb.value.selectedModelId;
});

const aliasTierTag = computed<"success" | "warning" | "info">(() => {
  if (lb.value?.tier === "free") return "success";
  if (lb.value?.tier === "paid") return "warning";
  return "info";
});

const rankedModels = computed(() =>
  [...(lb.value?.modelRanking ?? [])]
    .filter((m) => m.capability !== null)
    .sort((a, b) => (b.capability ?? 0) - (a.capability ?? 0))
);

async function load() {
  loading.value = true;
  errorMsg.value = "";
  data.value = [];
  try {
    data.value = await getModels();
  } catch (e) {
    errorMsg.value = errMsg(e);
    ElMessage.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}

async function loadLb() {
  lbLoading.value = true;
  try {
    lb.value = await getLeaderboard();
  } catch (e) {
    // 404 = 尚无结果，不报错，仅留空
    if (!(e instanceof ApiError && e.code === 404)) {
      ElMessage.error(errMsg(e));
    }
  } finally {
    lbLoading.value = false;
  }
}

async function onRefreshAlias() {
  lbRefreshing.value = true;
  try {
    lb.value = await refreshLeaderboard();
    ElMessage.success(`已刷新：别名指向 ${aliasTargetName.value}`);
  } catch (e) {
    ElMessage.error(errMsg(e));
  } finally {
    lbRefreshing.value = false;
  }
}

onMounted(() => {
  void load();
  void loadLb();
});
</script>

<template>
  <div class="page-models">
    <div class="toolbar">
      <h2>模型列表</h2>
      <el-button :loading="loading" type="primary" @click="load">刷新</el-button>
    </div>

    <!-- 经济型别名 auto-cheapest -->
    <el-card v-loading="lbLoading" shadow="never" class="alias-card">
      <template #header>
        <div class="alias-header">
          <span>经济型别名 <code>auto-cheapest</code></span>
          <el-button
            :loading="lbRefreshing"
            size="small"
            type="primary"
            @click="onRefreshAlias"
            >刷新经济别名</el-button
          >
        </div>
      </template>
      <template v-if="lb">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="当前指向">
            <el-tag :type="aliasTierTag" size="small">{{ aliasTargetName }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="档位">
            {{ lb.tier === "free" ? "免费优先" : lb.tier === "paid" ? "付费高性价比" : "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="选用原因">{{ lb.reason ?? "—" }}</el-descriptions-item>
          <el-descriptions-item label="数据来源">
            {{ lb.usedSources.join(", ") || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ lb.updatedAt }}</el-descriptions-item>
        </el-descriptions>

        <el-collapse class="rank-collapse">
          <el-collapse-item title="排行榜能力排序（我们的模型）" name="rank">
            <el-table :data="rankedModels" stripe size="small" max-height="360">
              <el-table-column label="模型" prop="name" min-width="200" />
              <el-table-column label="ID" prop="id" min-width="220" />
              <el-table-column label="倍率" min-width="90" align="center">
                <template #default="{ row }">
                  <el-tag size="small">{{ row.creditsLabel }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="能力指数" min-width="100" align="center">
                <template #default="{ row }">
                  {{ row.capability != null ? Math.round(row.capability * 100) : "—" }}
                </template>
              </el-table-column>
              <el-table-column label="百分位" min-width="90" align="center">
                <template #default="{ row }">
                  {{ row.percentile != null ? row.percentile.toFixed(2) : "—" }}
                </template>
              </el-table-column>
              <el-table-column label="输入价($/M)" min-width="110" align="center">
                <template #default="{ row }">
                  {{ row.inputPrice != null ? row.inputPrice : "—" }}
                </template>
              </el-table-column>
              <el-table-column label="输出价($/M)" min-width="110" align="center">
                <template #default="{ row }">
                  {{ row.outputPrice != null ? row.outputPrice : "—" }}
                </template>
              </el-table-column>
              <el-table-column label="匹配榜单名" prop="matchedName" min-width="180" />
            </el-table>
          </el-collapse-item>
        </el-collapse>
      </template>
      <el-empty v-else description="尚无筛选结果，点击右上角刷新" />
    </el-card>

    <el-card v-loading="loading" shadow="never" class="models-card">
      <el-alert
        v-if="errorMsg && data.length === 0"
        type="error"
        :closable="false"
        :title="errorMsg"
      />
      <el-table v-else :data="data" stripe size="default" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="ID">{{ row.id }}</el-descriptions-item>
              <el-descriptions-item label="厂商">{{ row.owned_by }}</el-descriptions-item>
              <el-descriptions-item label="描述">
                {{ row.descriptionZh || "—" }}
              </el-descriptions-item>
              <el-descriptions-item label="倍率">
                <el-tag :type="creditsTagType(row)" size="small">{{ row.creditsLabel }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="最大输入">
                {{ formatTokens(row.maxInputTokens) }} tokens
              </el-descriptions-item>
              <el-descriptions-item label="最大输出">
                {{ formatTokens(row.maxOutputTokens) }} tokens
              </el-descriptions-item>
              <el-descriptions-item label="最大内容大小">
                {{ formatBytes(row.maxAllowedSize) }}
              </el-descriptions-item>
              <el-descriptions-item label="能力">
                <template v-if="capabilityTags(row).length">
                  <el-tag
                    v-for="t in capabilityTags(row)"
                    :key="t.label"
                    :type="t.type"
                    size="small"
                    style="margin-right: 4px"
                    >{{ t.label }}</el-tag
                  >
                </template>
                <span v-else>—</span>
              </el-descriptions-item>
              <el-descriptions-item label="默认模型">
                {{ row.isDefault ? "是" : "否" }}
              </el-descriptions-item>
              <el-descriptions-item label="标签">
                <template v-if="row.tags && row.tags.length">
                  <el-tag
                    v-for="t in row.tags"
                    :key="t"
                    type="info"
                    size="small"
                    style="margin-right: 4px"
                    >{{ t }}</el-tag
                  >
                </template>
                <span v-else>—</span>
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="180">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.isDefault" size="small" type="primary" style="margin-left: 6px"
              >默认</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column label="ID" prop="id" min-width="220" />
        <el-table-column label="厂商" prop="owned_by" min-width="110" />
        <el-table-column label="倍率" min-width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="creditsTagType(row)" size="small">
              {{ row.creditsLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="能力" min-width="140">
          <template #default="{ row }">
            <template v-if="capabilityTags(row).length">
              <el-tag
                v-for="t in capabilityTags(row)"
                :key="t.label"
                :type="t.type"
                size="small"
                style="margin-right: 4px"
                >{{ t.label }}</el-tag
              >
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="最大输入" min-width="100" align="center">
          <template #default="{ row }">{{ formatTokens(row.maxInputTokens) }}</template>
        </el-table-column>
        <el-table-column label="最大输出" min-width="100" align="center">
          <template #default="{ row }">{{ formatTokens(row.maxOutputTokens) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page-models {
  max-width: 960px;
  margin: 0 auto;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.toolbar h2 {
  margin: 0;
}
.alias-card {
  margin-bottom: 16px;
}
.alias-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.alias-header code {
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}
.rank-collapse {
  margin-top: 12px;
}
</style>
