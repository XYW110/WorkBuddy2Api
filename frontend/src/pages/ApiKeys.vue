<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '../api/client'
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from '../api/api-keys'
import type { ApiKey } from '../api/types'

const loading = ref(false)
const items = ref<ApiKey[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const createVisible = ref(false)
const createSubmitting = ref(false)
const createForm = reactive({ name: '' })

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return '请求失败'
}

async function load() {
  loading.value = true
  try {
    const data = await listApiKeys({ page: page.value, pageSize: pageSize.value })
    items.value = data.items
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
  } catch (e) {
    ElMessage.error(errMsg(e))
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void load()
}

function onSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  void load()
}

function showOnceKey(key: ApiKey) {
  const text = [
    `名称: ${key.name}`,
    `ID: ${key.id}`,
    `key: ${key.key}`,
    '',
    '请立即复制保存，关闭后列表仅显示脱敏值，无法再次查看明文。',
  ].join('\n')
  void ElMessageBox.alert(text, '明文 API Key（仅此一次）', {
    confirmButtonText: '已复制并关闭',
    type: 'warning',
  })
}

async function onCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  createSubmitting.value = true
  try {
    const created = await createApiKey({ name: createForm.name.trim() })
    createVisible.value = false
    createForm.name = ''
    showOnceKey(created)
    await load()
  } catch (e) {
    ElMessage.error(errMsg(e))
  } finally {
    createSubmitting.value = false
  }
}

async function onToggleEnabled(row: ApiKey, enabled: boolean) {
  const prev = row.enabled
  row.enabled = enabled
  try {
    const updated = await updateApiKey(row.id, { enabled })
    Object.assign(row, updated)
    ElMessage.success(enabled ? '已启用' : '已禁用')
  } catch (e) {
    row.enabled = prev
    ElMessage.error(errMsg(e))
  }
}

async function onRename(row: ApiKey) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新名称', '重命名', {
      inputValue: row.name,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    const name = String(value).trim()
    if (!name || name === row.name) return
    const updated = await updateApiKey(row.id, { name })
    Object.assign(row, updated)
    ElMessage.success('已更新')
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(errMsg(e))
  }
}

async function onDelete(row: ApiKey) {
  try {
    await ElMessageBox.confirm(
      `确认删除 API Key「${row.name}」？此操作不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteApiKey(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(errMsg(e))
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page-api-keys">
    <div class="toolbar">
      <h2>管理 API Key</h2>
      <div class="actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="createVisible = true">创建</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="此处 sk- 为客户端访问 /v1 的 Key，与凭证中的 ck_ 严格区分。创建仅一次明文。"
      class="hint"
    />

    <el-table v-loading="loading" :data="items" stripe border row-key="id">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="Key" min-width="200">
        <template #default="{ row }">
          <code class="mask">{{ row.key }}</code>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            @change="(v: string | number | boolean) => onToggleEnabled(row, Boolean(v))"
          />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" min-width="170" />
      <el-table-column prop="updatedAt" label="更新时间" min-width="170" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="onRename(row)">重命名</el-button>
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

    <el-dialog v-model="createVisible" title="创建 API Key" width="440px" destroy-on-close>
      <el-form label-width="80px" @submit.prevent="onCreate">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="调用方识别名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-api-keys {
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
</style>
