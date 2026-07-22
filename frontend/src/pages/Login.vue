<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";

const router = useRouter();
const auth = useAuthStore();
const config = useConfigStore();

const tokenInput = ref("");
const submitting = ref(false);

const brandName = computed(() => config.config.brandName);

async function onSubmit() {
  if (!tokenInput.value.trim()) return;
  submitting.value = true;
  try {
    if (await auth.login(tokenInput.value)) {
      await router.replace("/");
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="brand">{{ brandName }}</h2>
      <el-form @submit.prevent="onSubmit">
        <el-form-item label="管理员 Token">
          <el-input
            v-model="tokenInput"
            type="password"
            placeholder="请输入 ADMIN_TOKEN"
            show-password
            :disabled="submitting"
          />
        </el-form-item>
        <el-alert
          v-if="auth.errorMessage"
          :title="auth.errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="error-alert"
        />
        <el-button
          type="primary"
          native-type="submit"
          :loading="submitting"
          class="submit-btn"
        >
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f0f2f5;
}

.login-card {
  width: 400px;
}

.brand {
  text-align: center;
  margin-bottom: 24px;
}

.error-alert {
  margin-bottom: 16px;
}

.submit-btn {
  width: 100%;
}
</style>
