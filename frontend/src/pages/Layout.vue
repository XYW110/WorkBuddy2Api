<script setup lang="ts">
// Layout 页 — §5 空壳：侧栏菜单 + router-view 出口
import NavMenu from '../components/NavMenu.vue'
</script>

<template>
  <el-container class="layout-container">
    <el-aside width="200px">
      <NavMenu />
    </el-aside>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped>
.layout-container {
  height: 100vh;
}
</style>