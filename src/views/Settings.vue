<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { dbPromise } from '../db'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Device } from '@capacitor/device'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import PageVisibilitySettings from '../components/PageVisibilitySettings.vue'
import { collectFromSource } from '../db/query'
import Swal from 'sweetalert2'
import { configurablePageDefinitions } from '../templates/pages'
import {
  defaultInteractionSettings,
  loadInteractionSettings,
  saveInteractionSettings,
} from '../utils/interactionPreferences'
import { setOnboardingComplete } from '../utils/onboardingPreferences'
import {
  getTemplateCatalogEntryLabel,
  getTemplateCatalogLabel,
  getTemplateCustomerSectionLabel,
  getTemplateDailySalesQuota,
  getTemplateExpiryAlertSettings,
  getTemplatePaymentLabel,
  getTemplatePointsMultiplier,
  getTemplateProfessionalFeeLabel,
} from '../utils/templatePresentation'

const router = useRouter()
const store = useStore()

const status = ref('')
const progress = ref(0)
const fileName = ref('business_companion_backup.json')
const restoreInput = ref(null)
const activeTab = ref('general')
const appNameLimit = 40
const appName = ref('Business Companion')
const appNameStatus = ref('')
const isDarkMode = ref(localStorage.getItem('darkMode') === 'true')
const interactionSettings = ref({ ...defaultInteractionSettings })
const interactionStatus = ref('')
const pagesList = configurablePageDefinitions
const activeTemplate = computed(() => store.getters['template/activeTemplate'])
const canSellProducts = computed(() => activeTemplate.value?.workflow?.allowProductSales !== false && activeTemplate.value?.capabilities?.products !== false)
const canSellServices = computed(() => activeTemplate.value?.workflow?.allowServiceSales !== false && activeTemplate.value?.capabilities?.services !== false)
const templateProfileStatus = ref('')
const templateProfileSaving = ref(false)
const loyaltyEnabled = ref(true)
const requireCustomer = ref(false)
const pointsMultiplier = ref(1)
const dailySalesQuota = ref(40000)
const expiryWarningDays = ref(30)
const expiryCriticalDays = ref(7)
const allowExpiredSales = ref(false)
const showProductChart = ref(true)
const showServiceChart = ref(true)
const catalogLabel = ref('Items')
const catalogEntryLabel = ref('Item')
const professionalFeeLabel = ref('Additional Fee')
const customerSectionLabel = ref('Sold to')
const customerActionLabel = ref('Select Customer')
const paymentCashLabel = ref('Cash')
const paymentGcashLabel = ref('Online Bank')

const settingsTabs = [
  { id: 'general', label: 'General' },
  { id: 'template', label: 'Template' },
  { id: 'data', label: 'Data' },
  { id: 'security', label: 'Security' },
  { id: 'about', label: 'About' },
]

function applyTemplateProfileForm(template) {
  const labels = template?.labels || {}
  loyaltyEnabled.value = template?.customer?.enableLoyalty !== false
  requireCustomer.value = template?.workflow?.requireCustomer === true || template?.customer?.requireCustomerDetails === true
  pointsMultiplier.value = getTemplatePointsMultiplier(template || {})
  dailySalesQuota.value = getTemplateDailySalesQuota(template || {})
  const expirySettings = getTemplateExpiryAlertSettings(template || {})
  expiryWarningDays.value = expirySettings.warningDays
  expiryCriticalDays.value = expirySettings.criticalDays
  allowExpiredSales.value = expirySettings.allowExpiredSales === true
  showProductChart.value = template?.reporting?.showProductChart !== false
  showServiceChart.value = template?.reporting?.showServiceChart !== false
  catalogLabel.value = getTemplateCatalogLabel(labels)
  catalogEntryLabel.value = getTemplateCatalogEntryLabel(labels)
  professionalFeeLabel.value = getTemplateProfessionalFeeLabel(labels)
  customerSectionLabel.value = getTemplateCustomerSectionLabel(labels)
  customerActionLabel.value = labels.customerAction || 'Select Customer'
  paymentCashLabel.value = getTemplatePaymentLabel('cash', labels)
  paymentGcashLabel.value = getTemplatePaymentLabel('gcash', labels)
}

watch(activeTemplate, template => {
  applyTemplateProfileForm(template)
}, { immediate: true })

function buildTemplateProfileOverrides() {
  return {
    customer: {
      ...(activeTemplate.value?.customer || {}),
      enableLoyalty: loyaltyEnabled.value,
      requireCustomerDetails: requireCustomer.value,
      pointsMultiplier: Number(pointsMultiplier.value),
    },
    payments: { ...(activeTemplate.value?.payments || {}) },
    pages: { ...(activeTemplate.value?.pages || {}) },
    workflow: {
      ...(activeTemplate.value?.workflow || {}),
      requireCustomer: requireCustomer.value,
    },
    reporting: {
      ...(activeTemplate.value?.reporting || {}),
      dailySalesQuota: Number(dailySalesQuota.value),
      expiryWarningDays: Number(expiryWarningDays.value),
      expiryCriticalDays: Number(expiryCriticalDays.value),
      allowExpiredSales: canSellProducts.value && allowExpiredSales.value,
      showProductChart: canSellProducts.value ? showProductChart.value : false,
      showServiceChart: canSellServices.value ? showServiceChart.value : false,
    },
    labels: {
      ...(activeTemplate.value?.labels || {}),
      catalog: catalogLabel.value.trim(),
      catalogEntry: catalogEntryLabel.value.trim(),
      professionalFee: professionalFeeLabel.value.trim(),
      customerSection: customerSectionLabel.value.trim(),
      customerAction: customerActionLabel.value.trim(),
      paymentCash: paymentCashLabel.value.trim(),
      paymentGcash: paymentGcashLabel.value.trim(),
    },
  }
}

async function saveTemplateProfileSettings() {
  const normalizedPointsMultiplier = Number(pointsMultiplier.value)
  const normalizedDailySalesQuota = Number(dailySalesQuota.value)
  const normalizedExpiryWarningDays = Number(expiryWarningDays.value)
  const normalizedExpiryCriticalDays = Number(expiryCriticalDays.value)

  if (!Number.isFinite(normalizedPointsMultiplier) || normalizedPointsMultiplier <= 0) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid points multiplier',
      text: 'Enter a points multiplier greater than 0.',
    })
    return
  }

  if (!Number.isFinite(normalizedDailySalesQuota) || normalizedDailySalesQuota <= 0) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid daily quota',
      text: 'Enter a daily sales quota greater than 0.',
    })
    return
  }

  if (!Number.isFinite(normalizedExpiryWarningDays) || normalizedExpiryWarningDays <= 0) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid near-expiry window',
      text: 'Enter a near-expiry warning window greater than 0 days.',
    })
    return
  }

  if (!Number.isFinite(normalizedExpiryCriticalDays) || normalizedExpiryCriticalDays <= 0 || normalizedExpiryCriticalDays > normalizedExpiryWarningDays) {
    await Swal.fire({
      icon: 'warning',
      title: 'Invalid urgent expiry window',
      text: 'Enter an urgent expiry window greater than 0 days and not larger than the near-expiry window.',
    })
    return
  }

  if (templateProfileSaving.value) {
    return
  }

  templateProfileSaving.value = true

  try {
    const savedTemplate = await store.dispatch('template/setActiveTemplate', {
      templateId: activeTemplate.value?.id,
      overrides: buildTemplateProfileOverrides(),
    })
    applyTemplateProfileForm(savedTemplate)
    templateProfileStatus.value = 'Template profile saved'
    await Swal.fire({
      icon: 'success',
      title: 'Template profile saved',
      timer: 1400,
      showConfirmButton: false,
    })
  } catch (err) {
    console.error('Failed to save template profile settings', err)
    templateProfileStatus.value = 'Failed to save template profile: ' + err.message
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: err.message || 'Unable to save template profile settings.',
    })
  } finally {
    templateProfileSaving.value = false
  }
}

function clampAppName(value) {
  return String(value || '').slice(0, appNameLimit)
}

function handleAppNameInput(event) {
  appName.value = clampAppName(event.target.value)
}

async function loadAppName() {
  try {
    const db = await dbPromise
    const row = await db.get('app_settings', 'app-name')
    appName.value = clampAppName(row?.value?.trim() || 'Business Companion')
  } catch (err) {
    console.error('Failed to load app name', err)
    appName.value = 'Business Companion'
  }
}

async function saveAppName() {
  const trimmed = clampAppName(appName.value).trim()
  const value = trimmed || 'Business Companion'

  try {
    const db = await dbPromise
    await db.put('app_settings', { key: 'app-name', value })
    appName.value = value
    appNameStatus.value = 'App name saved'
    await Swal.fire({
      icon: 'success',
      title: 'Saved',
      text: 'Application name updated successfully.',
      timer: 1400,
      showConfirmButton: false,
    })
  } catch (err) {
    console.error('Failed to save app name', err)
    appNameStatus.value = 'Failed to save app name: ' + err.message
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: err.message || 'Unable to save the application name.'
    })
  }
}

function applyTheme(value) {
  isDarkMode.value = value
  document.body.classList.toggle('dark-mode', value)
  localStorage.setItem('darkMode', value)
}

function toggleNightMode() {
  applyTheme(!isDarkMode.value)
}

async function loadInteractionPreferences() {
  try {
    interactionSettings.value = await loadInteractionSettings()
  } catch (err) {
    console.error('Failed to load interaction settings', err)
    interactionSettings.value = { ...defaultInteractionSettings }
  }
}

async function toggleInteractionSetting(key) {
  const nextSettings = {
    ...interactionSettings.value,
    [key]: !interactionSettings.value[key],
  }

  try {
    interactionSettings.value = await saveInteractionSettings(nextSettings)
    interactionStatus.value = 'Interaction preferences saved'
    window.dispatchEvent(new CustomEvent('interaction-settings-changed', {
      detail: interactionSettings.value,
    }))
    await Swal.fire({
      icon: 'success',
      title: 'Preferences saved',
      timer: 1200,
      showConfirmButton: false,
    })
  } catch (err) {
    console.error('Failed to save interaction settings', err)
    interactionStatus.value = 'Failed to save interaction preferences: ' + err.message
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: err.message || 'Unable to save interaction preferences.'
    })
  }
}

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

async function openTemplateSetup({ reset = false } = {}) {
  if (reset) {
    const result = await Swal.fire({
      icon: 'question',
      title: 'Rerun setup?',
      text: 'This will reopen the onboarding flow so you can retest and change the current template profile.',
      showCancelButton: true,
      confirmButtonText: 'Rerun setup',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1abc9c',
      cancelButtonColor: '#888',
    })

    if (!result.isConfirmed) {
      return
    }

    await setOnboardingComplete(false)
  }

  await router.push({ name: 'Setup' })
}

function openAboutPage() {
  router.push({ name: 'About' })
}

async function backupDB() {
  status.value = 'Preparing backup...'
  progress.value = 0
  try {
    const db = await dbPromise
    const backupData = {}
    const storeNames = Array.from(db.objectStoreNames)

    for (let i = 0; i < storeNames.length; i++) {
      const name = storeNames[i]
      backupData[name] = await collectFromSource(
        db.transaction(name).objectStore(name)
      )
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
        title: 'Business Companion Backup',
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

onMounted(async () => {
  await checkPinOnEntry()
  if (pinUnlocked.value) {
    applyTheme(isDarkMode.value)
    pinIsSet.value = !!(await getPin())
    await loadAppName()
    await loadInteractionPreferences()
  }
})
</script>

<template>
  <div v-if="pinUnlocked" class="settings-grid">
    <div class="left-col">
      <div class="settings-hero card card-hero">
        <div class="section-heading">
          <span class="section-icon">⚙️</span>
          <div>
            <h1>Settings</h1>
            <p class="muted">Manage branding, appearance, data safety, and access controls from one place.</p>
          </div>
        </div>

        <div class="settings-tabs" role="tablist" aria-label="Settings categories">
          <button
            v-for="tab in settingsTabs"
            :key="tab.id"
            type="button"
            class="settings-tab"
            :class="{ active: activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <template v-if="activeTab === 'general'">
      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">🏷️</span>
          <div>
            <h2>Branding</h2>
            <p class="muted">Customize the app name shown in the sidebar menu.</p>
          </div>
        </div>

        <div class="branding-form">
          <label for="app-name">Application Name</label>
          <input id="app-name" :value="appName" @input="handleAppNameInput" class="input" type="text" :maxlength="appNameLimit" placeholder="Business Companion" />
          <div class="text-limiter" :class="{ warning: appName.length >= appNameLimit }">
            {{ appName.length }}/{{ appNameLimit }} characters
          </div>
          <div class="branding-actions">
            <button class="primary" @click="saveAppName">Save App Name</button>
          </div>
          <p v-if="appNameStatus" class="status" :class="{ error: appNameStatus.includes('Failed') }">
            {{ appNameStatus }}
          </p>
        </div>
      </div>

      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">🌓</span>
          <div>
            <h2>Appearance</h2>
            <p class="muted">Switch between light mode and dark mode for the app interface.</p>
          </div>
        </div>

        <div class="theme-row">
          <div class="theme-copy">
            <strong>{{ isDarkMode ? 'Dark Mode' : 'Light Mode' }}</strong>
            <span>{{ isDarkMode ? 'Dark theme is currently enabled.' : 'Light theme is currently enabled.' }}</span>
          </div>

          <button class="secondary" @click="toggleNightMode">
            {{ isDarkMode ? 'Switch To Light Mode' : 'Switch To Dark Mode' }}
          </button>
        </div>
      </div>

      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">📳</span>
          <div>
            <h2>Interaction Feedback</h2>
            <p class="muted">Control keypad sound and vibration feedback on supported devices.</p>
          </div>
        </div>

        <div class="setting-stack">
          <div class="setting-row">
            <div class="setting-copy">
              <strong>Numpad Sound</strong>
              <span>Play a tap sound when pressing keypad buttons.</span>
            </div>

            <button class="secondary" @click="toggleInteractionSetting('soundEnabled')">
              {{ interactionSettings.soundEnabled ? 'Disable Sound' : 'Enable Sound' }}
            </button>
          </div>

          <div class="setting-row">
            <div class="setting-copy">
              <strong>Numpad Vibration</strong>
              <span>Trigger haptic feedback on keypad presses in Android builds. Some devices do not support vibration, or may have haptics disabled in system settings.</span>
            </div>

            <button class="secondary" @click="toggleInteractionSetting('vibrationEnabled')">
              {{ interactionSettings.vibrationEnabled ? 'Disable Vibration' : 'Enable Vibration' }}
            </button>
          </div>
        </div>

        <p v-if="interactionStatus" class="status" :class="{ error: interactionStatus.includes('Failed') }">
          {{ interactionStatus }}
        </p>
      </div>
      </template>

      <template v-if="activeTab === 'data'">
      <div class="card card-section card-emphasis">
        <div class="section-heading">
          <span class="section-icon">🗄️</span>
          <div>
            <h2>Database Management</h2>
            <p class="muted">Backup or restore your local data safely.</p>
          </div>
        </div>
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

      <div class="card card-section">
        <PageVisibilitySettings :pages="pagesList" />
      </div>
      </template>

      <template v-if="activeTab === 'template'">
      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">🧩</span>
          <div>
            <h2>Template Profile</h2>
            <p class="muted">Review the active template or reopen setup to adjust the business profile.</p>
          </div>
        </div>

        <div class="setting-row template-profile-row">
          <div class="setting-copy">
            <strong>{{ activeTemplate.label }}</strong>
            <span>{{ activeTemplate.description }}</span>
          </div>

          <div class="template-profile-actions">
            <button class="secondary" @click="openTemplateSetup()">Edit Template Profile</button>
            <button class="primary" @click="openTemplateSetup({ reset: true })">Rerun Setup</button>
          </div>
        </div>

        <div class="template-settings-sections">
          <section class="template-settings-section">
            <div class="template-section-header">
              <div>
                <h3>Workflow</h3>
                <p class="muted">Core checkout and customer behavior for the active template.</p>
              </div>
            </div>

            <div class="template-settings-grid">
              <label class="template-setting-field template-toggle-field">
                <span>Enable loyalty</span>
                <input v-model="loyaltyEnabled" type="checkbox" />
                <small>Keep customer points and redemption available in the sales flow.</small>
              </label>

              <label class="template-setting-field template-toggle-field">
                <span>Require customer selection</span>
                <input v-model="requireCustomer" type="checkbox" />
                <small>Require choosing a customer before completing checkout.</small>
              </label>

              <label class="template-setting-field">
                <span>Customer points multiplier</span>
                <input v-model.number="pointsMultiplier" class="input" type="number" min="0.01" step="0.01" />
                <small>Controls how much each redeemed customer point is worth during checkout.</small>
              </label>

              <label class="template-setting-field">
                <span>Daily sales quota</span>
                <input v-model.number="dailySalesQuota" class="input" type="number" min="1" step="1" />
                <small>Used by Analytics to compare each day against your target sales amount.</small>
              </label>
            </div>
          </section>

          <section class="template-settings-section">
            <div class="template-section-header">
              <div>
                <h3>Inventory Tracking</h3>
                <p class="muted">Product stock controls and expiry alerts used across inventory and analytics.</p>
              </div>
            </div>

            <div class="template-settings-grid">
              <label class="template-setting-field">
                <span>Near-expiry warning window</span>
                <input v-model.number="expiryWarningDays" class="input" type="number" min="1" step="1" />
                <small>Items inside this many days before expiry are flagged in inventory views and analytics.</small>
              </label>

              <label class="template-setting-field">
                <span>Urgent expiry window</span>
                <input v-model.number="expiryCriticalDays" class="input" type="number" min="1" step="1" :max="expiryWarningDays || undefined" />
                <small>Items inside this shorter window get the stronger expiry alert treatment.</small>
              </label>

              <label class="template-setting-field template-toggle-field">
                <span>Allow selling expired quantity</span>
                <input v-model="allowExpiredSales" type="checkbox" :disabled="!canSellProducts" />
                <small>When enabled, expired stock remains blocked in alerts but can still be counted as sellable and deducted during checkout.</small>
              </label>
            </div>
          </section>

          <section class="template-settings-section">
            <div class="template-section-header">
              <div>
                <h3>Analytics Display</h3>
                <p class="muted">Control which business charts stay visible for this template.</p>
              </div>
            </div>

            <div class="template-settings-grid template-settings-grid-compact">
              <label class="template-setting-field template-toggle-field">
                <span>Show product analytics chart</span>
                <input v-model="showProductChart" type="checkbox" :disabled="!canSellProducts" />
                <small>Controls whether the top products chart is shown in Analytics.</small>
              </label>

              <label class="template-setting-field template-toggle-field">
                <span>Show service analytics chart</span>
                <input v-model="showServiceChart" type="checkbox" :disabled="!canSellServices" />
                <small>Controls whether the top services chart is shown in Analytics.</small>
              </label>
            </div>
          </section>

          <section class="template-settings-section">
            <div class="template-section-header">
              <div>
                <h3>Screen Labels</h3>
                <p class="muted">Rename common terms shown in the catalog, POS flow, and customer sections.</p>
              </div>
            </div>

            <div class="template-settings-grid">
              <label class="template-setting-field">
                <span>Catalog label</span>
                <input v-model="catalogLabel" class="input" type="text" maxlength="40" placeholder="Items" />
                <small>Used for plural catalog wording across screens.</small>
              </label>

              <label class="template-setting-field">
                <span>Catalog entry label</span>
                <input v-model="catalogEntryLabel" class="input" type="text" maxlength="40" placeholder="Item" />
                <small>Used for singular catalog wording.</small>
              </label>

              <label class="template-setting-field">
                <span>Professional fee label</span>
                <input v-model="professionalFeeLabel" class="input" type="text" maxlength="40" placeholder="Additional Fee" />
                <small>Controls how service or labor charges are named.</small>
              </label>

              <label class="template-setting-field">
                <span>Customer section label</span>
                <input v-model="customerSectionLabel" class="input" type="text" maxlength="40" placeholder="Sold to" />
                <small>Shown where the selected customer section is named.</small>
              </label>

              <label class="template-setting-field">
                <span>Customer action label</span>
                <input v-model="customerActionLabel" class="input" type="text" maxlength="40" placeholder="Select Customer" />
                <small>Used on the POS action button for choosing a customer.</small>
              </label>
            </div>
          </section>

          <section class="template-settings-section">
            <div class="template-section-header">
              <div>
                <h3>Payment Wording</h3>
                <p class="muted">Adjust payment labels used during checkout and in history views.</p>
              </div>
            </div>

            <div class="template-settings-grid template-settings-grid-compact">
              <label class="template-setting-field">
                <span>Cash payment label</span>
                <input v-model="paymentCashLabel" class="input" type="text" maxlength="40" placeholder="Cash" />
                <small>Overrides the cash payment wording in checkout and history.</small>
              </label>

              <label class="template-setting-field">
                <span>Digital payment label</span>
                <input v-model="paymentGcashLabel" class="input" type="text" maxlength="40" placeholder="Online Bank" />
                <small>Overrides the non-cash payment wording in checkout and history.</small>
              </label>
            </div>
          </section>
        </div>

        <div class="branding-actions">
          <button class="primary" :disabled="templateProfileSaving" @click="saveTemplateProfileSettings">
            {{ templateProfileSaving ? 'Saving...' : 'Save Template Settings' }}
          </button>
        </div>

        <p v-if="templateProfileStatus" class="status" :class="{ error: templateProfileStatus.includes('Failed') }">
          {{ templateProfileStatus }}
        </p>
      </div>
      </template>

      <template v-if="activeTab === 'security'">
      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">🔒</span>
          <div>
            <h2>Security</h2>
            <p class="muted">Set a PIN to protect Settings access and prevent unauthorized changes.</p>
          </div>
        </div>
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
      </template>

      <template v-if="activeTab === 'about'">
      <div class="card card-section">
        <div class="section-heading">
          <span class="section-icon">ℹ️</span>
          <div>
            <h2>About</h2>
            <p class="muted">Read the app overview, disclaimer, and contact details.</p>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <strong>Open About Page</strong>
            <span>View application background, usage notes, and support contact information.</span>
          </div>

          <button class="secondary" @click="openAboutPage">Go To About</button>
        </div>
      </div>
      </template>
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
.settings-grid {
  display: flex;
  gap: 20px;
  padding: 24px;
  max-width: 1120px;
  margin: 0 auto;
  box-sizing: border-box;
}
.left-col {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.right-col { flex: 1 }
.card {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
}
body.dark-mode .card {
  background: linear-gradient(180deg, #36404a 0%, #313b45 100%);
  color: #eee;
  border-color: #536170;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
}

.card-hero {
  padding: 22px;
}

.settings-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.settings-tab {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.82);
  color: #334155;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.settings-tab:hover {
  background: rgba(255, 255, 255, 0.96);
}

.settings-tab.active {
  background: #0f172a;
  border-color: #0f172a;
  color: #f8fafc;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.18);
}

.card-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-emphasis {
  border-color: rgba(26, 188, 156, 0.18);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.section-heading h1,
.section-heading h2,
.section-heading h3 {
  margin: 0;
  color: #0f172a;
}

.section-heading h1 {
  font-size: 30px;
  line-height: 1;
  margin-bottom: 6px;
}

.section-heading h2 {
  font-size: 21px;
  line-height: 1.15;
  margin-bottom: 4px;
}

.section-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(26, 188, 156, 0.16), rgba(52, 152, 219, 0.18));
  font-size: 22px;
  flex-shrink: 0;
}
body.dark-mode .section-heading h1,
body.dark-mode .section-heading h2,
body.dark-mode .section-heading h3 {
  color: #f8fafc;
}
body.dark-mode .section-icon {
  background: linear-gradient(135deg, rgba(71, 215, 181, 0.18), rgba(125, 211, 252, 0.18));
}

body.dark-mode .settings-tab {
  background: rgba(49, 59, 69, 0.88);
  border-color: rgba(148, 163, 184, 0.24);
  color: #dbe6f2;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

body.dark-mode .settings-tab:hover {
  background: rgba(58, 69, 80, 0.96);
}

body.dark-mode .settings-tab.active {
  background: #1abc9c;
  border-color: #1abc9c;
  color: #07261f;
  box-shadow: 0 12px 24px rgba(26, 188, 156, 0.24);
}

/* reuse some existing styles */
.muted { color: #666; }
.branding-form { display: flex; flex-direction: column; gap: 10px; }
.branding-form label { font-weight: 600; color: #555; }
.text-limiter { align-self: flex-end; font-size: 12px; color: #6b7280; }
.text-limiter.warning { color: #d97706; font-weight: 600; }
.branding-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.16);
}
.setting-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: nowrap;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.16);
}
.template-profile-row {
  align-items: flex-start;
}
.template-profile-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.template-settings-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(241, 245, 249, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.template-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.template-section-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.2;
}

.template-section-header p {
  margin: 4px 0 0;
}

.template-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.template-settings-grid-compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.template-setting-field {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.16);
}
.template-setting-field > span {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
}
.template-setting-field > small {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
}

.inventory-settings-field {
  gap: 10px;
}

.inventory-settings-field-wide {
  grid-column: 1 / -1;
}

.template-toggle-field {
  align-content: start;
}

.template-toggle-field input[type="checkbox"] {
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
}
.theme-copy { display: flex; flex-direction: column; gap: 4px; }
.setting-copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.setting-row > button {
  flex: 0 0 auto;
}
.theme-copy strong { color: #1f2937; }
.setting-copy strong { color: #1f2937; }
.theme-copy span { color: #6b7280; font-size: 14px; }
.setting-copy span { color: #6b7280; font-size: 14px; }
.note {
  background: linear-gradient(180deg, #eef7ff 0%, #e6f3ff 100%);
  border: 1px solid rgba(33, 150, 243, 0.18);
  border-left: 4px solid #2196f3;
  padding: 14px;
  margin-bottom: 4px;
  border-radius: 14px;
  font-size: 0.95rem;
}
.actions { display:flex; flex-direction:column; gap:12px }
.restore-section {
  display:flex;
  flex-direction:column;
  gap:10px;
  padding-top:12px;
  border-top:1px solid #e5e7eb;
}
.file-label { display:flex; flex-direction:column; gap:6px; font-weight:600 }
.file-label input[type="file"] { width: 100% }
.progress-container {
  margin-top: 8px;
  background:#e5e7eb;
  border-radius:999px;
  height:12px;
  position:relative;
  overflow: hidden;
}
.progress-bar {
  background: linear-gradient(90deg, #1abc9c, #3498db);
  height:100%;
  transition: width 0.3s;
}
.progress-text {
  display: inline-block;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.status { margin-top:8px; font-style:italic; color:#666 }
.status.error { color: #c0392b; }

/* PIN management */
.pin-section { margin-top: 12px; display: flex; flex-direction: column; gap: 14px; }
.pin-status-row { display: flex; align-items: center; gap: 12px; }
.pin-label { font-size: 14px; color: #555; }
body.dark-mode .muted,
body.dark-mode .branding-form label,
body.dark-mode .pin-label { color: #bbb; }
body.dark-mode .theme-row {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.18);
}
body.dark-mode .setting-row {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.18);
}
body.dark-mode .theme-copy strong { color: #f8fafc; }
body.dark-mode .setting-copy strong { color: #f8fafc; }
body.dark-mode .theme-copy span { color: #cbd5e1; }
body.dark-mode .setting-copy span { color: #cbd5e1; }
body.dark-mode .template-setting-field {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.18);
}
body.dark-mode .template-settings-section {
  background: rgba(51, 65, 85, 0.34);
  border-color: rgba(148, 163, 184, 0.18);
}
body.dark-mode .template-section-header h3 { color: #f8fafc; }
body.dark-mode .template-setting-field span { color: #cbd5e1; }
body.dark-mode .template-setting-field small { color: #94a3b8; }
body.dark-mode .text-limiter { color: #94a3b8; }
body.dark-mode .text-limiter.warning { color: #fbbf24; }
body.dark-mode .note {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.12) 100%);
  border-color: rgba(96, 165, 250, 0.22);
}
body.dark-mode .restore-section { border-top-color: #4b5563; }
body.dark-mode .progress-container { background: #4b5563; }
body.dark-mode .progress-text { color: #cbd5e1; }
.pin-badge { font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 20px; }
.pin-active { background: #d4f5ec; color: #1a8a6e; }
.pin-inactive { background: #f0f0f0; color: #888; }
body.dark-mode .pin-active { background: #1a3a2e; color: #1abc9c; }
body.dark-mode .pin-inactive { background: #2a2a2a; color: #888; }
.pin-btn-row { display: flex; gap: 10px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .settings-grid {
    padding: 16px;
  }

  .settings-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-tab {
    width: 100%;
  }

  .section-heading {
    gap: 12px;
  }

  .section-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 20px;
  }

  .section-heading h1 {
    font-size: 26px;
  }

  .theme-row,
  .setting-row,
  .pin-status-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .template-settings-grid {
    grid-template-columns: 1fr;
  }

  .template-settings-grid-compact {
    grid-template-columns: 1fr;
  }
}
</style>
