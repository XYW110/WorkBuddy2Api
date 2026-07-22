import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clearAdminToken, getAdminToken, setAdminToken } from '../api/client'
import { verifyAdminToken } from '../api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getAdminToken())
  const verified = ref(false)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value) && verified.value)

  function setToken(value: string) {
    token.value = value
    setAdminToken(value)
  }

  function logout() {
    token.value = null
    verified.value = false
    errorMessage.value = null
    clearAdminToken()
  }

  async function login(inputToken: string): Promise<boolean> {
    loading.value = true
    errorMessage.value = null
    setToken(inputToken.trim())
    try {
      await verifyAdminToken()
      verified.value = true
      return true
    } catch (e) {
      logout()
      errorMessage.value = e instanceof Error ? e.message : '登录失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function restoreSession(): Promise<boolean> {
    if (!token.value) {
      verified.value = false
      return false
    }
    loading.value = true
    try {
      await verifyAdminToken()
      verified.value = true
      return true
    } catch {
      logout()
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    token,
    verified,
    loading,
    errorMessage,
    isAuthenticated,
    setToken,
    logout,
    login,
    restoreSession,
  }
})
