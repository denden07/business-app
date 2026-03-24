<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStore } from 'vuex'
import Swal from 'sweetalert2'
import { configurablePageDefinitions, templatePageSettingByRouteName } from '../templates/pages'
import { loadResolvedActiveTemplate } from '../utils/templatePreferences'
import { setOnboardingComplete } from '../utils/onboardingPreferences'
import { dbPromise } from '../db'

const router = useRouter()
const route = useRoute()
const store = useStore()

const steps = ['Business', 'Template', 'Customize', 'Review']
const currentStep = ref(0)
const isSaving = ref(false)
const appName = ref('')
const selectedTemplateId = ref('generic')
const catalogMode = ref('mixed')
const trackStock = ref(false)
const trackBatches = ref(false)
const trackExpiry = ref(false)
const pageVisibility = ref({})

const availableTemplates = computed(() => store.getters['template/availableTemplates'])
const selectedTemplate = computed(() => {
  return availableTemplates.value.find(template => template.id === selectedTemplateId.value) || availableTemplates.value[0]
})
const isServiceOnlyMode = computed(() => catalogMode.value === 'services')
const progressPercent = computed(() => {
  if (steps.length <= 1) {
    return 100
  }

  return (currentStep.value / (steps.length - 1)) * 100
})

const customizationSummary = computed(() => ({
  catalogMode: catalogMode.value,
  trackStock: trackStock.value,
  trackBatches: trackBatches.value,
  trackExpiry: trackExpiry.value,
  visiblePages: configurablePageDefinitions.filter(page => pageVisibility.value[page.name] !== false),
}))

const canProceed = computed(() => {
  if (currentStep.value === 0) {
    return appName.value.trim().length > 1
  }

  return true
})

function applyTemplatePreset(template) {
  const servicesEnabled = template.workflow?.allowServiceSales !== false
  const productsEnabled = template.workflow?.allowProductSales !== false

  if (servicesEnabled && productsEnabled) {
    catalogMode.value = template.workflow?.allowMixedItems ? 'mixed' : 'products'
  } else if (servicesEnabled) {
    catalogMode.value = 'services'
  } else {
    catalogMode.value = 'products'
  }

  trackStock.value = !!template.itemDefaults?.trackStock
  trackBatches.value = !!template.itemDefaults?.trackBatches
  trackExpiry.value = !!template.itemDefaults?.trackExpiry
  pageVisibility.value = { ...template.defaultPageVisibility }
}

function goNext() {
  if (!canProceed.value || currentStep.value >= steps.length - 1) {
    return
  }

  currentStep.value += 1
}

function goBack() {
  if (currentStep.value <= 0) {
    return
  }

  currentStep.value -= 1
}

function togglePageVisibility(pageName) {
  pageVisibility.value[pageName] = pageVisibility.value[pageName] === false
}

function buildTemplateOverrides() {
  const productsEnabled = catalogMode.value !== 'services'
  const servicesEnabled = catalogMode.value !== 'products'
  const allowMixedItems = catalogMode.value === 'mixed'
  const canTrackStock = productsEnabled && trackStock.value
  const canTrackBatches = canTrackStock && trackBatches.value
  const canTrackExpiry = canTrackBatches && trackExpiry.value
  const pages = {}

  for (const page of configurablePageDefinitions) {
    const pageKey = templatePageSettingByRouteName[page.name]
    pages[pageKey] = pageVisibility.value[page.name] !== false
  }

  return {
    capabilities: {
      products: productsEnabled,
      services: servicesEnabled,
      stockTracking: canTrackStock ? 'required' : false,
      batchTracking: canTrackBatches ? 'required' : false,
      expiryTracking: canTrackExpiry ? 'required' : false,
    },
    workflow: {
      allowProductSales: productsEnabled,
      allowServiceSales: servicesEnabled,
      allowMixedItems,
      requireBatchSelection: canTrackBatches,
    },
    itemDefaults: {
      itemType: catalogMode.value === 'services' ? 'service' : 'product',
      trackStock: canTrackStock,
      trackBatches: canTrackBatches,
      trackExpiry: canTrackExpiry,
    },
    pages,
  }
}

async function saveSetup() {
  if (isSaving.value) {
    return
  }

  isSaving.value = true

  try {
    const trimmedAppName = appName.value.trim()
    const overrides = buildTemplateOverrides()
    const template = await store.dispatch('template/setActiveTemplate', {
      templateId: selectedTemplateId.value,
      overrides,
      forcePageVisibility: true,
    })
    const db = await dbPromise

    await db.put('app_settings', {
      key: 'app-name',
      value: trimmedAppName,
    })

    await setOnboardingComplete(true)

    await Swal.fire({
      icon: 'success',
      title: 'Setup complete',
      text: `${template.label} is now active for ${trimmedAppName}.`,
      timer: 1400,
      showConfirmButton: false,
    })

    const redirectTarget = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'

    await router.replace(redirectTarget)
  } catch (err) {
    console.error('Failed to save setup', err)
    await Swal.fire({
      icon: 'error',
      title: 'Setup failed',
      text: err.message || 'Unable to finish setup right now.',
    })
  } finally {
    isSaving.value = false
  }
}

watch(selectedTemplate, template => {
  if (template) {
    applyTemplatePreset(template)
  }
}, { immediate: false })

watch(trackStock, value => {
  if (!value) {
    trackBatches.value = false
    trackExpiry.value = false
  }
})

watch(trackBatches, value => {
  if (!value) {
    trackExpiry.value = false
  }
})

watch(catalogMode, value => {
  if (value === 'services') {
    trackStock.value = false
    trackBatches.value = false
    trackExpiry.value = false
  }
})

onMounted(async () => {
  const currentTemplate = await loadResolvedActiveTemplate()
  const db = await dbPromise
  const appNameRow = await db.get('app_settings', 'app-name')

  appName.value = appNameRow?.value?.trim() || ''
  selectedTemplateId.value = currentTemplate.id
  applyTemplatePreset(currentTemplate)
})
</script>

<template>
  <div class="setup-shell">
    <section class="setup-hero">
      <div class="setup-copy">
        <span class="eyebrow">First-Time Setup</span>
        <h1>Shape the app around your business before you start using it.</h1>
        <p>
          Choose a template, adjust the core behavior, and enter with a setup that already matches how the business works.
        </p>
      </div>

      <div class="setup-progress">
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>

        <div class="setup-steps">
          <div
            v-for="(step, index) in steps"
            :key="step"
            :class="['step-node', { active: index === currentStep, done: index < currentStep }]"
          >
            <span>{{ index + 1 }}</span>
            <strong>{{ step }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="setup-card">
      <div v-if="currentStep === 0" class="step-panel">
        <h2>Business profile</h2>
        <p class="muted">Start with a business name. You can refine the rest in the next steps.</p>

        <label for="setup-app-name">Business name</label>
        <input id="setup-app-name" v-model="appName" class="input" type="text" placeholder="e.g. Luna Pharmacy" />
      </div>

      <div v-else-if="currentStep === 1" class="step-panel">
        <h2>Choose a template</h2>
        <p class="muted">Templates are starting points. You can still customize them in the next step.</p>

        <div class="template-grid">
          <button
            v-for="template in availableTemplates"
            :key="template.id"
            type="button"
            :class="['template-tile', { selected: template.id === selectedTemplateId }]"
            @click="selectedTemplateId = template.id"
          >
            <strong>{{ template.label }}</strong>
            <span>{{ template.description }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="currentStep === 2" class="step-panel">
        <h2>Quick customization</h2>
        <p class="muted">Adjust only the essentials for now. Deeper tuning can come later.</p>

        <div class="option-group">
          <span class="group-label">What do you sell?</span>
          <div class="segmented">
            <button type="button" :class="{ active: catalogMode === 'products' }" @click="catalogMode = 'products'">Products</button>
            <button type="button" :class="{ active: catalogMode === 'mixed' }" @click="catalogMode = 'mixed'">Both</button>
            <button type="button" :class="{ active: catalogMode === 'services' }" @click="catalogMode = 'services'">Services</button>
          </div>
        </div>

        <div v-if="!isServiceOnlyMode" class="toggle-stack">
          <label class="toggle-row">
            <input v-model="trackStock" type="checkbox" />
            <div>
              <strong>Track stock</strong>
              <span>Enable quantity-based inventory for products.</span>
            </div>
          </label>

          <label class="toggle-row">
            <input v-model="trackBatches" type="checkbox" :disabled="!trackStock" />
            <div>
              <strong>Track batches</strong>
              <span>Useful for grouped inventory entries and expiry-sensitive products.</span>
            </div>
          </label>

          <label class="toggle-row">
            <input v-model="trackExpiry" type="checkbox" :disabled="!trackBatches" />
            <div>
              <strong>Track expiry</strong>
              <span>Recommended for regulated or perishable inventory.</span>
            </div>
          </label>
        </div>

        <div v-else class="service-note">
          <strong>Service-only mode selected.</strong>
          <span>Inventory tracking options are hidden because services do not use stock, batches, or expiry tracking.</span>
        </div>

        <div class="option-group">
          <span class="group-label">Default visible pages</span>
          <div class="page-chip-grid">
            <button
              v-for="page in configurablePageDefinitions"
              :key="page.name"
              type="button"
              :class="['page-chip', { active: pageVisibility[page.name] !== false }]"
              @click="togglePageVisibility(page.name)"
            >
              <span class="page-chip-icon" aria-hidden="true">{{ pageVisibility[page.name] !== false ? '✓' : '✕' }}</span>
              <span>{{ page.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="step-panel review-panel">
        <h2>Review</h2>
        <p class="muted">This is what will be applied when you enter the app.</p>

        <div class="review-grid">
          <article>
            <span>Business</span>
            <strong class="review-value review-value-break">{{ appName || 'Business Companion' }}</strong>
          </article>

          <article>
            <span>Template</span>
            <strong class="review-value">{{ selectedTemplate.label }}</strong>
          </article>

          <article>
            <span>Catalog mode</span>
            <strong class="review-value">{{ customizationSummary.catalogMode }}</strong>
          </article>

          <article>
            <span>Inventory</span>
            <strong class="review-value review-value-break">
              {{ customizationSummary.trackStock ? 'Stock on' : 'Stock off' }},
              {{ customizationSummary.trackBatches ? 'batches on' : 'batches off' }},
              {{ customizationSummary.trackExpiry ? 'expiry on' : 'expiry off' }}
            </strong>
          </article>
        </div>

        <div class="review-pages">
          <span>Visible pages</span>
          <div class="page-chip-grid static">
            <span v-for="page in customizationSummary.visiblePages" :key="page.name" class="page-chip active">
              {{ page.label }}
            </span>
          </div>
        </div>
      </div>

      <div class="setup-actions">
        <button class="secondary" type="button" :disabled="currentStep === 0 || isSaving" @click="goBack">Back</button>

        <button
          v-if="currentStep < steps.length - 1"
          class="primary"
          type="button"
          :disabled="!canProceed"
          @click="goNext"
        >
          Continue
        </button>

        <button
          v-else
          class="primary"
          type="button"
          :disabled="isSaving || !canProceed"
          @click="saveSetup"
        >
          {{ isSaving ? 'Saving...' : 'Finish Setup' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.setup-shell {
  min-height: 100vh;
  padding: 32px 0 48px;
  display: grid;
  gap: 24px;
  background:
    radial-gradient(circle at top left, rgba(26, 188, 156, 0.16), transparent 30%),
    radial-gradient(circle at top right, rgba(15, 23, 42, 0.08), transparent 22%),
    linear-gradient(180deg, #f4fbf8 0%, #eef4fb 100%);
}

.setup-hero,
.setup-card {
  width: min(980px, calc(100vw - 32px));
  margin: 0 auto;
}

.setup-hero {
  display: grid;
  gap: 20px;
  padding: 28px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.12);
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.setup-copy h1 {
  margin: 12px 0 10px;
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1.06;
  color: #0f172a;
}

.setup-copy p,
.muted {
  margin: 0;
  color: #475569;
}

.setup-progress {
  display: grid;
  gap: 14px;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(203, 213, 225, 0.72);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0f766e 0%, #1abc9c 100%);
  transition: width 0.25s ease;
}

.setup-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.step-node {
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  color: #64748b;
}

.step-node span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 2px solid rgba(148, 163, 184, 0.36);
  background: rgba(255, 255, 255, 0.96);
  font-size: 13px;
  font-weight: 700;
}

.step-node strong {
  font-size: 13px;
}

.step-node.active,
.step-node.done {
  color: #0f172a;
}

.step-node.active span,
.step-node.done span {
  border-color: #0f172a;
  background: #0f172a;
  color: #f8fafc;
}

.setup-card {
  padding: 28px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.24);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
}

.step-panel {
  display: grid;
  gap: 18px;
}

.step-panel h2 {
  margin: 0;
  font-size: 28px;
  color: #0f172a;
}

.step-panel label,
.group-label,
.review-pages span,
.review-grid span {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.input {
  width: 100%;
  min-height: 52px;
  border-radius: 16px;
  border: 1px solid #cbd5e1;
  padding: 0 16px;
  font-size: 16px;
  background: #fff;
  color: #0f172a;
}

.template-grid,
.page-chip-grid,
.review-grid {
  display: grid;
  gap: 14px;
}

.template-grid {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.template-tile {
  display: grid;
  gap: 8px;
  text-align: left;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid #dbe4ea;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  color: #0f172a;
}

.template-tile.selected {
  border-color: #0f766e;
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.1) 0%, rgba(255, 255, 255, 0.96) 100%);
  box-shadow: 0 16px 30px rgba(15, 118, 110, 0.14);
}

.template-tile span {
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}

.option-group,
.toggle-stack,
.review-pages {
  display: grid;
  gap: 12px;
}

.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
}

.segmented button,
.page-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  font-weight: 700;
}

.page-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  font-size: 12px;
  line-height: 1;
}

.segmented button.active,
.page-chip.active {
  background: #0f172a;
  border-color: #0f172a;
  color: #f8fafc;
}

.page-chip.active .page-chip-icon {
  background: rgba(255, 255, 255, 0.18);
}

.page-chip-grid {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.toggle-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid #dbe4ea;
  background: #f8fbfd;
}

.toggle-row input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
}

.toggle-row strong {
  display: block;
  color: #0f172a;
}

.toggle-row span {
  display: block;
  margin-top: 4px;
  color: #475569;
  font-size: 14px;
}

.service-note {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid rgba(15, 118, 110, 0.18);
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.08) 0%, rgba(255, 255, 255, 0.96) 100%);
}

.service-note strong {
  color: #0f172a;
}

.service-note span {
  color: #475569;
  font-size: 14px;
}

.review-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.review-grid article {
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 20px;
  background: #f8fbfd;
  border: 1px solid #dbe4ea;
}

.review-grid strong {
  color: #0f172a;
  font-size: 18px;
}

.review-value {
  display: block;
  max-width: 100%;
  line-height: 1.35;
}

.review-value-break {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.setup-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
}

.setup-actions button {
  min-width: 140px;
}

@media (max-width: 640px) {
  .setup-shell {
    padding-top: 16px;
  }

  .setup-hero,
  .setup-card {
    width: min(100vw - 20px, 980px);
    padding: 20px;
  }

  .setup-actions {
    flex-direction: column-reverse;
  }

  .setup-actions button {
    width: 100%;
  }

  .setup-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>