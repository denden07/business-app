<script setup>
import { ref, onMounted } from 'vue'
import { dbPromise } from '../db'
import { refreshRoutes } from '../router'

const props = defineProps({
  pages: {
    type: Array,
    default: () => [
      { name: 'Home', label: 'Home' },
      { name: 'Medicines', label: 'Medicines' },
      { name: 'Sales', label: 'Sales' },
      { name: 'Customers', label: 'Customers' },
      { name: 'Analytics', label: 'Analytics' },
    //   { name: 'Settings', label: 'Settings' },
    ]
  }
})

const visibility = ref({})
const loading = ref(true)
const saving = ref(false)
const status = ref('')

async function load() {
  loading.value = true
  try {
    const db = await dbPromise
    const rows = await db.getAll('pages')
    const map = {}
    props.pages.forEach(p => (map[p.name] = true))
    for (const r of rows) map[r.name] = !!r.visible
    visibility.value = map
  } catch (err) {
    console.error('load visibility', err)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const db = await dbPromise
    const tx = db.transaction('pages', 'readwrite')
    const store = tx.objectStore('pages')
    for (const p of props.pages) {
      await store.put({ name: p.name, visible: !!visibility.value[p.name] })
    }
    await tx.done
    status.value = 'Saved'
    try { await refreshRoutes() } catch (e) { console.warn(e) }
  } catch (err) {
    console.error('save visibility', err)
    status.value = 'Failed: ' + err.message
  } finally {
    saving.value = false
    setTimeout(() => (status.value = ''), 2500)
  }
}

function resetToDefaults() {
  props.pages.forEach(p => (visibility.value[p.name] = true))
  save()
}

onMounted(load)
</script>

<template>
  <section class="pv-card">
    <div class="pv-header">
      <h3>Page Visibility</h3>
      <p class="muted">Show or hide app pages. Hidden pages will be removed from the sidebar and router.</p>
    </div>

    <div v-if="loading" class="pv-loading">Loading…</div>

    <div v-else class="pv-list">
      <div v-for="p in props.pages" :key="p.name" class="pv-item">
        <div class="pv-item-left">
          <strong>{{ p.label }}</strong>
          <div class="muted small">/{{ p.name.toLowerCase() }}</div>
        </div>
        <div class="pv-item-right">
          <label class="switch">
            <input type="checkbox" v-model="visibility[p.name]" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="pv-actions">
        <button class="btn primary" @click="save" :disabled="saving">Save</button>
        <button class="btn" @click="resetToDefaults" :disabled="saving">Reset to defaults</button>
        <span class="status">{{ status }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pv-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
}

.pv-header h3 { margin: 0 0 6px 0 }
.muted { color: #666 }
.small { font-size: 12px }

.pv-list { display: flex; flex-direction: column; gap: 10px }
.pv-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 6px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.pv-item-left { display:flex; flex-direction:column }
.pv-item-right { display:flex; align-items:center }

.pv-actions { display:flex; gap:10px; align-items:center; margin-top:12px }
.status { color:#666 }

/* simple toggle switch */
.switch { position: relative; display: inline-block; width: 46px; height: 26px }
.switch input { opacity: 0; width: 0; height: 0 }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; transition: .2s; border-radius: 26px }
.slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; transition: .2s; border-radius: 50% }
.switch input:checked + .slider { background: #1abc9c }
.switch input:checked + .slider:before { transform: translateX(20px) }

.btn { padding: 8px 12px; border-radius: 8px; border: none; cursor:pointer }
.btn.primary { background: #1abc9c; color: #fff }
</style>
