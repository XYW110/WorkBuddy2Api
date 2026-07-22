import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_UI_CONFIG, loadEnvConfig, loadRuntimeConfig, type AdminUiConfig } from '../config'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AdminUiConfig>(loadEnvConfig())
  const ready = ref(false)

  async function init() {
    config.value = await loadRuntimeConfig()
    if (typeof document !== 'undefined' && config.value.pageTitle) {
      document.title = config.value.pageTitle
    }
    ready.value = true
  }

  return {
    config,
    ready,
    init,
    defaults: DEFAULT_UI_CONFIG,
  }
})
