<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { dbPromise } from '../db'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Device } from '@capacitor/device'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { refreshRoutes } from '../router'
import PageVisibilitySettings from '../components/PageVisibilitySettings.vue'
import Swal from 'sweetalert2'

const router = useRouter()

const status = ref('')
const progress = ref(0)
const fileName = ref('pharmacy_pos_backup.json')
const restoreInput = ref(null)

/* ======================
   PIN GATE
====================== */
const pinUnlocked = ref(false)

async function getPin() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'settings-pin')
    return row ? row.value : null
  } catch { return null }
}
async function savePin(pin) {
  const db = await dbPromise
  await db.put('app_settings', { key: 'settings-pin', value: pin })
}
async function deletePin() {
  const db = await dbPromise
  await db.delete('app_settings', 'settings-pin')
}

async function checkPinOnEntry() {
  const storedPin = await getPin()
  if (!storedPin) { pinUnlocked.value = true; return }
  const result = await Swal.fire({
    title: '🔒 Settings Locked',
    text: 'Enter your PIN to access Settings',
    input: 'password',
    inputPlaceholder: 'Enter PIN',
    inputAttributes: { maxlength: 8, autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonText: 'Unlock',
    cancelButtonText: 'Go Back',
    confirmButtonColor: '#1abc9c',
    cancelButtonColor: '#888',
    allowOutsideClick: false,
    allowEscapeKey: false,
  })
  if (result.isConfirmed && result.value === storedPin) {
    pinUnlocked.value = true
  } else if (result.isConfirmed && result.value !== storedPin) {
    await Swal.fire({ icon: 'error', title: 'Incorrect PIN', timer: 1400, showConfirmButton: false })
    router.back()
  } else {
    router.back()
  }
}

/* ======================
   PIN MANAGEMENT
====================== */
const pinIsSet = ref(false)

async function setOrChangePin() {
  if (pinIsSet.value) {
    const verify = await Swal.fire({
      title: 'Verify current PIN',
      input: 'password',
      inputPlaceholder: 'Current PIN',
      inputAttributes: { maxlength: 8, autocomplete: 'off' },
      showCancelButton: true,
      confirmButtonColor: '#1abc9c',
      cancelButtonColor: '#888',
    })
    if (!verify.isConfirmed) return
    const storedPin = await getPin()
    if (verify.value !== storedPin) {
      Swal.fire({ icon: 'error', title: 'Incorrect PIN', text: 'Current PIN does not match.' })
      return
    }
  }
  const newPinResult = await Swal.fire({
    title: pinIsSet.value ? 'Enter new PIN' : 'Set a PIN',
    input: 'password',
    inputPlaceholder: '4–8 digit PIN',
    inputAttributes: { maxlength: 8, autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonColor: '#1abc9c',
    cancelButtonColor: '#888',
    inputValidator: (val) => { if (!val || val.length < 4) return 'PIN must be at least 4 characters' },
  })
  if (!newPinResult.isConfirmed) return
  const confirmResult = await Swal.fire({
    title: 'Confirm new PIN',
    input: 'password',
    inputPlaceholder: 'Re-enter new PIN',
    inputAttributes: { maxlength: 8, autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonColor: '#1abc9c',
    cancelButtonColor: '#888',
    inputValidator: (val) => { if (val !== newPinResult.value) return 'PINs do not match' },
  })
  if (!confirmResult.isConfirmed) return
  await savePin(newPinResult.value)
  pinIsSet.value = true
  Swal.fire({ icon: 'success', title: 'PIN saved!', timer: 1400, showConfirmButton: false })
}

async function removePin() {
  const verify = await Swal.fire({
    title: 'Remove PIN',
    text: 'Enter your current PIN to remove it',
    input: 'password',
    inputPlaceholder: 'Current PIN',
    inputAttributes: { maxlength: 8, autocomplete: 'off' },
    showCancelButton: true,
    confirmButtonText: 'Remove PIN',
    confirmButtonColor: '#e74c3c',
    cancelButtonColor: '#888',
  })
  if (!verify.isConfirmed) return
  const storedPin = await getPin()
  if (verify.value !== storedPin) {
    Swal.fire({ icon: 'error', title: 'Incorrect PIN', timer: 1400, showConfirmButton: false })
    return
  }
  await deletePin()
  pinIsSet.value = false
  Swal.fire({ icon: 'success', title: 'PIN removed', timer: 1400, showConfirmButton: false })
}

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
  await checkPinOnEntry()
  if (pinUnlocked.value) {
    pinIsSet.value = !!(await getPin())
    await loadPageVisibility()
  }
})
</script>

<template>
  <div v-if="pinUnlocked" class="settings-grid">
    <div class="left-col">
      <div class="card">
        <h1>Database Management</h1>
        <p class="note">
          💡 <b>Tip:</b> Keep your backups in a safe place (Google Drive, Email) to prevent data loss.
        </p>

        <div class="actions">
          <button class="success" @click="backupDB">Backup Database</button>

          <div class="restore-section">
            <label class="file-label">
              Select Backup File:
              <input type="file" accept=".json" ref="restoreInput" />
            </label>

            <button class="info" @click="restoreDB">
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

      <div class="card" style="margin-top:12px">
        <h2>🔒 Security</h2>
        <p class="muted">Set a PIN to protect Settings access and prevent unauthorized changes.</p>
        <div class="pin-section">
          <div class="pin-status-row">
            <span class="pin-label">PIN status:</span>
            <span :class="['pin-badge', pinIsSet ? 'pin-active' : 'pin-inactive']">
              {{ pinIsSet ? '🔒 Active' : '🔓 Not set' }}
            </span>
          </div>
          <div class="pin-btn-row">
            <button class="primary" @click="setOrChangePin">{{ pinIsSet ? 'Change PIN' : 'Set PIN' }}</button>
            <button v-if="pinIsSet" class="danger" @click="removePin">Remove PIN</button>
          </div>
        </div>
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
body.dark-mode .card { background: #1e1e1e; color: #eee; }

/* reuse some existing styles */
.note { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin-bottom: 12px; font-size: 0.9rem }
.actions { display:flex; flex-direction:column; gap:12px }
.restore-section { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px solid #eee }
.progress-container { margin-top: 12px; background:#eee; border-radius:10px; height:20px; position:relative }
.progress-bar { background:#2ecc71; height:100%; transition: width 0.3s }
.status { margin-top:12px; font-style:italic; color:#666 }

/* PIN management */
.pin-section { margin-top: 12px; display: flex; flex-direction: column; gap: 14px; }
.pin-status-row { display: flex; align-items: center; gap: 12px; }
.pin-label { font-size: 14px; color: #555; }
body.dark-mode .pin-label { color: #bbb; }
.pin-badge { font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 20px; }
.pin-active { background: #d4f5ec; color: #1a8a6e; }
.pin-inactive { background: #f0f0f0; color: #888; }
body.dark-mode .pin-active { background: #1a3a2e; color: #1abc9c; }
body.dark-mode .pin-inactive { background: #2a2a2a; color: #888; }
.pin-btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
