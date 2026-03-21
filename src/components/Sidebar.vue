<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { dbPromise } from '../db'

const router = useRouter()
const route = useRoute()

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

// Toggle dark mode
const toggleNightMode = () => {
  isDarkMode.value = !isDarkMode.value
  document.body.classList.toggle('dark-mode', isDarkMode.value)
  localStorage.setItem('darkMode', isDarkMode.value)
}

// Menu
const menuItems = [
  { name: 'Home', path: '/', icon: '🏠' },
  { name: 'Medicines', path: '/medicines', icon: '💊' },
  { name: 'Sales', path: '/sales', icon: '💰' },
  { name: 'Drafts', path: '/drafts', icon: '📝' },
  { name: 'Customers', path: '/customers', icon: '🧑‍🤝‍🧑' },
  { name: 'Analytics', path: '/analytics', icon: '📊' },
  { name: 'Settings', path: '/settings', icon: '⚙️' },
]

const isActive = (path) => route.path === path

const pageVisibility = ref(null)
const appName = ref('Pharmacy POS')
let refreshTimer = null

async function loadAppName() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'app-name')
    appName.value = row?.value?.trim() || 'Pharmacy POS'
  } catch (err) {
    console.error('Failed to load app name', err)
    appName.value = 'Pharmacy POS'
  }
}

async function loadVisibility() {
  try {
    const db = await dbPromise
    const all = await db.getAll('pages')
    const map = {}
    all.forEach(r => { map[r.name] = !!r.visible })
    // if no records, default to showing all
    if (!all.length) {
      menuItems.forEach(m => (map[m.name] = true))
    }
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
  return menuItems.filter(m => pageVisibility.value[m.name] !== false)
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
          <span>{{ item.name }}</span>
        </button>
      </li>
    </ul>

    <button class="night-mode-btn" @click="toggleNightMode">
      <span class="icon">🌙</span>
      <span>Night Mode</span>
    </button>
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
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
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
  background: #3b4c60;
  border-radius: 6px;
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

.menu-list button {
  width: 100%;
  background: none;
  border: none;
  color: inherit;
  padding: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  font-size: 15px;
  transition: background 0.2s;
}

.menu-list button:hover {
  background: #3b4c60;
}

.menu-list button.active {
  background: #1abc9c;
  color: #fff;
  font-weight: 600;
}

/* Night Mode Button */
.night-mode-btn {
  background: #34495e;
  border: none;
  color: #fff;
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 15px;
  width: 100%;
  margin-top: 16px;
  transition: background 0.2s;
}

.night-mode-btn:hover {
  background: #3b4c60;
}

body.dark-mode .night-mode-btn {
  background: #ffc107;
  color: #000;
}

body.dark-mode .night-mode-btn:hover {
  background: #ffb300;
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
