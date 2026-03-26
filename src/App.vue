<template>
  <div class="app-container">
    <Sidebar v-if="!route.meta?.hideSidebar" />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import Sidebar from '../src/components/Sidebar.vue'

const route = useRoute()
</script>

<style>
:root {
  --sidebar-width: 0;
}
</style>

<style scoped>
.app-container {
  width: 100%;
  min-height: 100%;
}

/* Main content takes full width */
.main-content {
  width: 100%;
  min-height: 100%;
  min-height: 100dvh;
  padding: 0 16px;
  box-sizing: border-box;
}
</style>
