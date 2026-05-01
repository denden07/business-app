<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import Sidebar from '../src/components/Sidebar.vue'
import { consumePendingAuthLoginRedirectContext } from './utils/auth'

const route = useRoute()
const router = useRouter()
const store = useStore()

let idleCheckTimer = null
let activityThrottleTimer = null

async function redirectToLoginIfNeeded() {
  const isAuthenticated = store.getters['auth/isAuthenticated']
  const isEnabled = store.getters['auth/isEnabled']

  if (isEnabled && !isAuthenticated && route.name !== 'Login' && route.name !== 'Setup') {
    const redirectContext = consumePendingAuthLoginRedirectContext()

    await router.replace({
      name: 'Login',
      query: {
        redirect: redirectContext?.redirect || route.fullPath,
        reason: redirectContext?.reason || 'expired',
      },
    })
  }
}

async function syncAuthFromActivity() {
  await store.dispatch('auth/recordActivity')
  await redirectToLoginIfNeeded()
}

function handleUserActivity() {
  if (activityThrottleTimer) {
    return
  }

  activityThrottleTimer = window.setTimeout(() => {
    activityThrottleTimer = null
  }, 1000)

  syncAuthFromActivity()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    syncAuthFromActivity()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleUserActivity, true)
  window.addEventListener('keydown', handleUserActivity, true)
  window.addEventListener('focus', handleUserActivity)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  idleCheckTimer = window.setInterval(() => {
    store.dispatch('auth/refresh').then(redirectToLoginIfNeeded)
  }, 60 * 1000)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleUserActivity, true)
  window.removeEventListener('keydown', handleUserActivity, true)
  window.removeEventListener('focus', handleUserActivity)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (idleCheckTimer) {
    window.clearInterval(idleCheckTimer)
  }

  if (activityThrottleTimer) {
    window.clearTimeout(activityThrottleTimer)
  }
})
</script>

<template>
  <div class="app-container">
    <Sidebar v-if="!route.meta?.hideSidebar" />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

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
