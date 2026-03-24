<script setup>
import { ref, onMounted } from 'vue'
import { dbPromise } from '../db'
import { refreshRoutes } from '../router'
import Swal from 'sweetalert2'
import { configurablePageDefinitions } from '../templates/pages'
import {
  loadEffectivePageVisibility,
  loadResolvedActiveTemplate,
} from '../utils/templatePreferences'

const props = defineProps({
  pages: {
    type: Array,
    default: () => configurablePageDefinitions,
  }
})

const visibility = ref({})
const loading = ref(true)
const saving = ref(false)

async function requirePin() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'settings-pin')
    const storedPin = row ? row.value : null
    if (!storedPin) return true
    const result = await Swal.fire({
      title: '🔒 Confirm PIN',
      text: 'Enter your PIN to save changes',
      input: 'password',
      inputPlaceholder: 'Enter PIN',
      inputAttributes: { maxlength: 8, autocomplete: 'off' },
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      confirmButtonColor: '#1abc9c',
      cancelButtonColor: '#888',
      allowOutsideClick: false,
    })
    if (!result.isConfirmed) return false
    if (result.value !== storedPin) {
      Swal.fire({ icon: 'error', title: 'Incorrect PIN', timer: 1400, showConfirmButton: false })
      return false
    }
    return true
  } catch { return true }
}

async function load() {
  loading.value = true
  try {
    const { map } = await loadEffectivePageVisibility()
    visibility.value = map
  } catch (err) {
    console.error('load visibility', err)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!(await requirePin())) return
  saving.value = true
  try {
    const db = await dbPromise
    const tx = db.transaction('pages', 'readwrite')
    const store = tx.objectStore('pages')
    for (const p of props.pages) {
      await store.put({ name: p.name, visible: !!visibility.value[p.name] })
    }
    await tx.done
    try { await refreshRoutes() } catch (e) { console.warn(e) }
    Swal.fire({ icon: 'success', title: 'Saved!', toast: true, position: 'bottom-end', timer: 1800, showConfirmButton: false })
  } catch (err) {
    console.error('save visibility', err)
    Swal.fire({ icon: 'error', title: 'Failed to save', text: err.message })
  } finally {
    saving.value = false
  }
}

async function resetToDefaults() {
  const template = await loadResolvedActiveTemplate()

  props.pages.forEach(page => {
    visibility.value[page.name] = template.defaultPageVisibility[page.name] !== false
  })

  await save()
}

onMounted(load)
</script>

<template>
  <section class="pv-card">
    <div class="pv-header">
      <div>
        <h3>Page Visibility</h3>
        <p class="muted">Show or hide app pages. Hidden pages are removed from the sidebar and router.</p>
      </div>
      <span class="pv-summary">{{ props.pages.length }} pages</span>
    </div>

    <div v-if="loading" class="pv-loading">Loading…</div>

    <div v-else class="pv-list">
      <div v-for="p in props.pages" :key="p.name" class="pv-item">
        <div class="pv-item-left">
          <strong>{{ p.label }}</strong>
          <div class="muted small">/{{ p.name.toLowerCase() }}</div>
        </div>
        <div class="pv-item-right">
          <span :class="['pv-badge', visibility[p.name] ? 'is-visible' : 'is-hidden']">
            {{ visibility[p.name] ? 'Visible' : 'Hidden' }}
          </span>
          <label class="switch">
            <input type="checkbox" v-model="visibility[p.name]" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="pv-actions">
        <button class="btn primary" @click="save" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button class="btn" @click="resetToDefaults" :disabled="saving">Reset to defaults</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pv-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.pv-header h3 {
  margin: 0 0 6px 0;
  font-size: 21px;
  color: #0f172a;
}

.pv-summary {
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

.muted { color: #64748b }
.small { font-size: 12px }

.pv-loading {
  padding: 18px;
  border-radius: 14px;
  border: 1px dashed #cbd5e1;
  color: #64748b;
  text-align: center;
  background: rgba(248, 250, 252, 0.8);
}

.pv-list { display: flex; flex-direction: column; gap: 10px }
.pv-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid #dbe4ea;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.pv-item-left { display:flex; flex-direction:column }
.pv-item-left strong {
  color: #0f172a;
  font-size: 15px;
}

.pv-item-right {
  display:flex;
  align-items:center;
  gap: 12px;
}

.pv-badge {
  min-width: 72px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.pv-badge.is-visible {
  background: rgba(26, 188, 156, 0.12);
  color: #0f766e;
}

.pv-badge.is-hidden {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}

.pv-actions {
  display:flex;
  gap:10px;
  align-items:center;
  margin-top: 6px;
  flex-wrap: wrap;
}
.status { color:#666 }

/* simple toggle switch */
.switch { position: relative; display: inline-block; width: 46px; height: 26px }
.switch input { opacity: 0; width: 0; height: 0 }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #cbd5e1;
  transition: .2s;
  border-radius: 26px;
}
.slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; transition: .2s; border-radius: 50% }
.switch input:checked + .slider { background: #1abc9c }
.switch input:checked + .slider:before { transform: translateX(20px) }

.switch input:focus-visible + .slider {
  outline: 3px solid rgba(52, 152, 219, 0.24);
  outline-offset: 2px;
}

body.dark-mode .pv-header h3,
body.dark-mode .pv-item-left strong {
  color: #f8fafc;
}

body.dark-mode .muted {
  color: #cbd5e1;
}

body.dark-mode .pv-summary,
body.dark-mode .pv-badge.is-visible {
  background: rgba(71, 215, 181, 0.16);
  color: #86efac;
}

body.dark-mode .pv-badge.is-hidden {
  background: rgba(100, 116, 139, 0.24);
  color: #cbd5e1;
}

body.dark-mode .pv-loading {
  background: rgba(49, 59, 69, 0.7);
  border-color: #536170;
  color: #cbd5e1;
}

body.dark-mode .pv-item {
  background: linear-gradient(180deg, #3b4651 0%, #34404a 100%);
  border-color: #536170;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

body.dark-mode .slider {
  background: #64748b;
}

@media (max-width: 640px) {
  .pv-header,
  .pv-item,
  .pv-item-right {
    flex-direction: column;
    align-items: flex-start;
  }

  .pv-item-right {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
