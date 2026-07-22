<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { ApiError } from "../api/client";
import { getModels } from "../api/models";
import type { ModelInfo } from "../api/types";

const loading = ref(false);
const data = ref<ModelInfo[]>([]);
const errorMsg = ref("");

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

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page-models">
    <div class="toolbar">
      <h2>模型列表</h2>
      <el-button :loading="loading" type="primary" @click="load"
        >刷新</el-button
      >
    </div>

    <el-card v-loading="loading" shadow="never">
      <el-alert
        v-if="errorMsg && data.length === 0"
        type="error"
        :closable="false"
        :title="errorMsg"
      />
      <el-table v-else :data="data" stripe size="default">
        <el-table-column label="名称" prop="name" min-width="200" />
        <el-table-column label="ID" prop="id" min-width="240" />
        <el-table-column label="厂商" prop="owned_by" min-width="120" />
        <el-table-column label="倍率" min-width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="creditsTagType(row)" size="small">
              {{ row.creditsLabel }}
            </el-tag>
          </template>
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
</style>
