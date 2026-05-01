<script setup>
import { onMounted, ref } from 'vue'
import Swal from 'sweetalert2'
import { configurablePageDefinitions } from '../templates/pages'
import {
  loadPinProtectedPages,
  loadSettingsPin,
  savePinProtectedPages,
} from '../utils/auth'

const pages = configurablePageDefinitions.filter(page => page.name !== 'Settings')

const protectedPages = ref({})
const loading = ref(true)
const saving = ref(false)
const pinSet = ref(false)

async function load() {
  loading.value = true

  try {
    protectedPages.value = await loadPinProtectedPages()
    pinSet.value = Boolean(await loadSettingsPin())
  } catch (error) {
    console.error('Failed to load PIN protected pages', error)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!pinSet.value) {
    await Swal.fire({
      icon: 'warning',
      title: 'PIN required first',
      text: 'Set a PIN before enabling page-level PIN protection.',
    })
    return
  }

  saving.value = true

  try {
    protectedPages.value = await savePinProtectedPages(protectedPages.value)
    await Swal.fire({
      icon: 'success',
      title: 'Protected pages updated',
      timer: 1400,
      showConfirmButton: false,
    })
  } catch (error) {
    console.error('Failed to save protected pages', error)
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: error.message || 'Unable to save PIN protected pages.',
    })
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="pin-pages-card">
    <div class="pin-pages-header">
      <div>
        <h3>PIN Protected Pages</h3>
        <p class="muted">Choose which pages should ask for your PIN before opening.</p>
      </div>
      <span class="pin-pages-summary">{{ pages.length }} pages</span>
    </div>

    <p v-if="!pinSet && !loading" class="pin-pages-note">
      Set a PIN first to enable page-level protection.
    </p>

    <div v-if="loading" class="pin-pages-loading">Loading…</div>

    <div v-else class="pin-pages-list">
      <div v-for="page in pages" :key="page.name" class="pin-pages-item">
        <div class="pin-pages-item-left">
          <strong>{{ page.label }}</strong>
          <span class="muted small">{{ page.path }}</span>
        </div>

        <div class="pin-pages-item-right">
          <span :class="['pin-pages-badge', protectedPages[page.name] ? 'is-protected' : 'is-open']">
            {{ protectedPages[page.name] ? 'PIN' : 'Open' }}
          </span>

          <label class="switch">
            <input v-model="protectedPages[page.name]" type="checkbox" :disabled="!pinSet" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="pin-pages-actions">
        <button class="btn primary" :disabled="saving || !pinSet" @click="save">
          {{ saving ? 'Saving…' : 'Save Protected Pages' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pin-pages-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pin-pages-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.pin-pages-header h3 {
  margin: 0 0 6px;
  font-size: 18px;
  color: #0f172a;
}

.pin-pages-summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(26, 188, 156, 0.12);
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.pin-pages-note,
.pin-pages-loading {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px dashed #cbd5e1;
  color: #64748b;
}

.pin-pages-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pin-pages-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid #dbe4ea;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
}

.pin-pages-item-left {
  display: flex;
  flex-direction: column;
}

.pin-pages-item-left strong {
  color: #0f172a;
}

.pin-pages-item-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pin-pages-badge {
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.pin-pages-badge.is-protected {
  background: rgba(26, 188, 156, 0.12);
  color: #0f766e;
}

.pin-pages-badge.is-open {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}

.pin-pages-actions {
  margin-top: 4px;
}

.muted {
  color: #64748b;
}

.small {
  font-size: 12px;
}

.switch { position: relative; display: inline-block; width: 46px; height: 26px }
.switch input { opacity: 0; width: 0; height: 0 }
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #cbd5e1;
  transition: .2s;
  border-radius: 26px;
}
.slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: white;
  transition: .2s;
  border-radius: 50%;
}
.switch input:checked + .slider { background: #1abc9c }
.switch input:checked + .slider:before { transform: translateX(20px) }

body.dark-mode .pin-pages-header h3,
body.dark-mode .pin-pages-item-left strong {
  color: #f8fafc;
}

body.dark-mode .pin-pages-note,
body.dark-mode .pin-pages-loading,
body.dark-mode .pin-pages-item {
  background: rgba(49, 59, 69, 0.82);
  border-color: rgba(119, 139, 160, 0.28);
}

body.dark-mode .muted {
  color: #cbd5e1;
}

body.dark-mode .pin-pages-badge.is-open {
  color: #dbe4ec;
}
</style>