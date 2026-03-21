<script setup>
import { onMounted, ref } from 'vue'
import { dbPromise } from '../db'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Device } from '@capacitor/device'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { refreshRoutes } from '../router'
import PageVisibilitySettings from '../components/PageVisibilitySettings.vue'

const status = ref('')
const progress = ref(0)
const fileName = ref('pharmacy_pos_backup.json')
const restoreInput = ref(null)

const pageVisibility = ref({})
const pagesList = ref([
  { name: 'Home', label: 'Home' },
  { name: 'Medicines', label: 'Medicines' },
  { name: 'Sales', label: 'Sales' },
  { name: 'Customers', label: 'Customers' },
  { name: 'Analytics', label: 'Analytics' },
])

async function backupDB() {
  status.value = 'Preparing backup...'
  progress.value = 0
  try {
    const db = await dbPromise
    const backupData = {}
    const storeNames = Array.from(db.objectStoreNames)

    for (let i = 0; i < storeNames.length; i++) {
      const name = storeNames[i]
      backupData[name] = await db.getAll(name)
      progress.value = Math.round(((i + 1) / storeNames.length) * 100)
    }

    const jsonString = JSON.stringify(backupData)
    const info = await Device.getInfo()

    if (info.platform === 'web' || !info.platform) {
      // Web download
      const blob = new Blob([jsonString], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName.value
      link.click()
      URL.revokeObjectURL(link.href)
      status.value = 'Backup downloaded!'
    } else {
      // Mobile save/share
      const writeResult = await Filesystem.writeFile({
        path: fileName.value,
        data: jsonString,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })

      await Share.share({
        title: 'Pharmacy POS Backup',
        text: 'Your backup is ready!',
        url: writeResult.uri,
      })
      status.value = 'Backup saved/shared!'
    }
  } catch (err) {
    console.error(err)
    status.value = 'Backup failed: ' + err.message
  }
}

async function restoreDB() {
  status.value = 'Initializing restore...'
  progress.value = 0
  try {
    const info = await Device.getInfo()
    let jsonString = ''

    if (info.platform === 'web' || !info.platform) {
      // Web restore from input
      if (!restoreInput.value) throw new Error('No file input found')
      const files = restoreInput.value.files
      if (!files || !files.length) throw new Error('No file selected')
      jsonString = await files[0].text()
    } else {
      // Mobile restore
      const picked = await FilePicker.pickFiles({ 
        multiple: false, 
        readData: true 
      })
      if (!picked.files.length) throw new Error('No file picked')
      const file = picked.files[0]
      if (!file.data) throw new Error('File content is empty or unreadable')
      jsonString = atob(file.data)
    }

    const backupData = JSON.parse(jsonString)
    const db = await dbPromise
    const storeNames = Array.from(db.objectStoreNames)
    
    const tx = db.transaction(storeNames, 'readwrite')

    for (let i = 0; i < storeNames.length; i++) {
      const storeName = storeNames[i]
      const store = tx.objectStore(storeName)
      
      await store.clear()
      
      const items = backupData[storeName] || []
      for (const item of items) {
        store.put(item)
      }
      
      progress.value = Math.round(((i + 1) / storeNames.length) * 100)
      status.value = `Restoring: ${storeName}...`
    }

    await tx.done
    status.value = 'Restore completed successfully!'
  } catch (err) {
    console.error(err)
    status.value = 'Restore failed: ' + err.message
  } finally {
    setTimeout(() => { progress.value = 0 }, 3000)
  }
}

async function loadPageVisibility() {
  try {
    const db = await dbPromise
    const all = await db.getAll('pages')
    const map = {}
    // default all true
    pagesList.value.forEach(p => (map[p.name] = true))
    for (const row of all) {
      map[row.name] = !!row.visible
    }
    pageVisibility.value = map
  } catch (err) {
    console.error('Failed loading page visibility', err)
  }
}

async function savePageVisibility() {
  try {
    const db = await dbPromise
    const tx = db.transaction('pages', 'readwrite')
    const store = tx.objectStore('pages')
    for (const p of pagesList.value) {
      await store.put({ name: p.name, visible: !!pageVisibility.value[p.name] })
    }
    await tx.done
    status.value = 'Page visibility saved'
    // refresh router so menu and routes reflect changes immediately
    try { await refreshRoutes() } catch (e) { console.warn('Failed to refresh routes', e) }
  } catch (err) {
    console.error('Failed saving page visibility', err)
    status.value = 'Failed saving page visibility: ' + err.message
  }
}

onMounted(async () => {
  // existing onMounted logic is inside the file; ensure we still load visibility
  await loadPageVisibility()
})
</script>

<template>
  <div class="settings-grid">
    <div class="left-col">
      <div class="card">
        <h1>Database Management</h1>
        <p class="note">
          💡 <b>Tip:</b> Keep your backups in a safe place (Google Drive, Email) to prevent data loss.
        </p>

        <div class="actions">
          <button class="btn-backup" @click="backupDB">Backup Database</button>

          <div class="restore-section">
            <label class="file-label">
              Select Backup File:
              <input type="file" accept=".json" ref="restoreInput" />
            </label>

            <button class="btn-restore" @click="restoreDB">
              Restore Database
            </button>
          </div>
        </div>

        <div v-if="progress > 0" class="progress-container">
          <div class="progress-bar" :style="{ width: progress + '%' }"></div>
          <span class="progress-text">{{ progress }}%</span>
        </div>

        <p class="status" :class="{ 'error': status.includes('failed') }">
          {{ status }}
        </p>
      </div>

      <div class="card" style="margin-top:12px">
        <PageVisibilitySettings :pages="pagesList" />
      </div>
    </div>

    <!-- <div class="right-col">
      <div class="card">
        <h2>Advanced</h2>
        <p class="muted">Device & export utilities</p>
        <p>Use backup and restore to move data between devices or keep periodic snapshots.</p>
      </div>
    </div> -->
  </div>
</template>

<style scoped>
/* layout */
.settings-grid { display: flex; gap: 18px; padding: 20px }
.left-col { flex: 2 }
.right-col { flex: 1 }
.card { background:#fff; padding: 16px; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06) }

/* reuse some existing styles */
.note { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin-bottom: 12px; font-size: 0.9rem }
.actions { display:flex; flex-direction:column; gap:12px }
.restore-section { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px solid #eee }
.btn-backup { background-color: #2ecc71; padding: 12px; color: #fff; border-radius:8px; border:none }
.btn-restore { background-color: #3498db; padding: 12px; color: #fff; border-radius:8px; border:none }
.progress-container { margin-top: 12px; background:#eee; border-radius:10px; height:20px; position:relative }
.progress-bar { background:#2ecc71; height:100%; transition: width 0.3s }
.status { margin-top:12px; font-style:italic; color:#666 }
</style>
