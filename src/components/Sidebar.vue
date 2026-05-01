<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { dbPromise } from '../db'
import { pageDefinitions } from '../templates/pages'
import { loadEffectivePageVisibility } from '../utils/templatePreferences'

const router = useRouter()
const route = useRoute()
const store = useStore()

// Menu drawer state (closed by default)
const isOpen = ref(false)

// Night mode
const isDarkMode = ref(localStorage.getItem('darkMode') === 'true')

// Apply dark mode on load
if (isDarkMode.value) {
  document.body.classList.add('dark-mode')
}

// Toggle menu drawer
const toggleMenu = () => {
  isOpen.value = !isOpen.value
}

// Close menu when navigating
const navigateTo = (path) => {
  router.push(path)
  isOpen.value = false
}

// Menu
const menuItems = pageDefinitions.filter(item => item.path)

const isActive = (path) => {
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(`${path}/`)
}

const pageVisibility = ref(null)
const appName = ref('Business Companion')
let refreshTimer = null
const authEnabled = computed(() => store.getters['auth/isEnabled'])
const authUsername = computed(() => store.state.auth.username || 'Admin')

async function loadAppName() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'app-name')
    appName.value = row?.value?.trim() || 'Business Companion'
  } catch (err) {
    console.error('Failed to load app name', err)
    appName.value = 'Business Companion'
  }
}

async function loadVisibility() {
  try {
    await dbPromise
    const { map } = await loadEffectivePageVisibility()
    pageVisibility.value = map
  } catch (err) {
    console.error('Failed to load page visibility', err)
    pageVisibility.value = null
  }
}

async function refreshSidebarState() {
  await Promise.all([loadVisibility(), loadAppName()])
}

onMounted(() => {
  refreshSidebarState()
  // simple polling to refresh settings changed in Settings page
  refreshTimer = setInterval(refreshSidebarState, 2500)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

const visibleMenu = () => {
  if (!pageVisibility.value) return menuItems

  return menuItems.filter(item => {
    if (item.configurable === false) {
      return true
    }

    return pageVisibility.value[item.name] !== false
  })
}

async function logout() {
  await store.dispatch('auth/logout')
  isOpen.value = false
  await router.replace('/login')
}
</script>

<template>
  <!-- Floating Hamburger Button -->
  <button class="hamburger-button" @click="toggleMenu">☰</button>

  <!-- Overlay Backdrop -->
  <div v-if="isOpen" class="menu-backdrop" @click="isOpen = false"></div>

  <!-- Drawer Menu -->
  <nav :class="['menu-drawer', { open: isOpen }]">
    <div class="menu-header">
      <h2 :title="appName">{{ appName }}</h2>
      <button class="close-btn" @click="toggleMenu">✕</button>
    </div>

    <ul class="menu-list">
      <li v-for="item in visibleMenu()" :key="item.path">
        <button
          :class="{ active: isActive(item.path) }"
          @click="navigateTo(item.path)"
        >
          <span class="icon">{{ item.icon }}</span>
          <span>{{ item.label || item.name }}</span>
        </button>
      </li>
    </ul>

    <div v-if="authEnabled" class="menu-footer">
      <div class="menu-user">
        <span class="menu-user-label">Signed in as</span>
        <strong>{{ authUsername }}</strong>
      </div>
      <button class="logout-btn" @click="logout">Sign Out</button>
    </div>
  </nav>
</template>

<style scoped>
/* Floating Hamburger Button */
.hamburger-button {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1000;
  background: #1abc9c;
  border: none;
  color: white;
  font-size: 24px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.hamburger-button:hover {
  background: #16a085;
}

/* Menu Backdrop (overlay) */
.menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* Drawer Menu */
.menu-drawer {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background: #2d3e50;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 16px;
  z-index: 1001;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}

.menu-drawer.open {
  transform: translateX(0);
}

/* Menu Header */
.menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #3b4c60;
}

.menu-header h2 {
  margin: 0;
  font-size: 18px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.close-btn:hover {
  background: transparent;
}

/* Menu List */
.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid #3b4c60;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.menu-user {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-user-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9fb0c3;
}

.logout-btn {
  width: 100%;
  background: rgba(231, 76, 60, 0.16);
  border: 1px solid rgba(231, 76, 60, 0.28);
  color: #ffe3df;
  box-shadow: none;
}

.logout-btn:hover {
  background: rgba(231, 76, 60, 0.24);
}

.menu-list button {
  width: 100%;
  background: none;
  border: none;
  color: inherit;
  padding: 12px 4px;
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  font-size: 15px;
  transition: color 0.2s, transform 0.2s;
  box-shadow: none!important;
}

.menu-list button:hover {
  background: transparent;
  color: #dff7f1;
  transform: translateX(2px);
}

.menu-list button.active {
  background: #1abc9c;
  color: #fff;
  font-weight: 600;
  box-shadow: none;
  transform: none;
}

/* Icon */
.icon {
  font-size: 18px;
  min-width: 24px;
  text-align: center;
}

/* Dark Mode */
body.dark-mode .menu-drawer {
  background: #1e1e1e;
}

body.dark-mode .menu-header {
  border-bottom-color: #333;
}

body.dark-mode .hamburger-button {
  background: #1abc9c;
}

body.dark-mode .hamburger-button:hover {
  background: #16a085;
}
</style>
