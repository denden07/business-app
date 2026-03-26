<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStore } from 'vuex'
import Swal from 'sweetalert2'
import { configurablePageDefinitions, templatePageSettingByRouteName } from '../templates/pages'
import { loadResolvedActiveTemplate } from '../utils/templatePreferences'
import { setOnboardingComplete } from '../utils/onboardingPreferences'
import { dbPromise } from '../db'
import {
  getTemplateDailySalesQuota,
  getTemplateExpiryAlertSettings,
  getTemplatePaymentLabel,
  getTemplatePointsMultiplier,
} from '../utils/templatePresentation'

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
const loyaltyEnabled = ref(true)
const requireCustomer = ref(false)
const pointsMultiplier = ref(1)
const dailySalesQuota = ref(40000)
const expiryWarningDays = ref(30)
const expiryCriticalDays = ref(7)
const showProductChart = ref(true)
const showServiceChart = ref(true)
const paymentMethods = ref({ cash: true, gcash: true })
const pageVisibility = ref({})

const availableTemplates = computed(() => store.getters['template/availableTemplates'])
const selectedTemplate = computed(() => {
  return availableTemplates.value.find(template => template.id === selectedTemplateId.value) || availableTemplates.value[0]
})
const selectedTemplateLabels = computed(() => selectedTemplate.value?.labels || {})
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
  loyaltyEnabled: loyaltyEnabled.value,
  requireCustomer: requireCustomer.value,
  pointsMultiplier: pointsMultiplier.value,
  dailySalesQuota: dailySalesQuota.value,
  expiryWarningDays: expiryWarningDays.value,
  expiryCriticalDays: expiryCriticalDays.value,
  showProductChart: showProductChart.value,
  showServiceChart: showServiceChart.value,
  paymentMethods: Object.entries(paymentMethods.value)
    .filter(([, enabled]) => enabled)
    .map(([method]) => getTemplatePaymentLabel(method, selectedTemplateLabels.value)),
  visiblePages: configurablePageDefinitions.filter(page => pageVisibility.value[page.name] !== false),
}))

const canProceed = computed(() => {
  if (currentStep.value === 0) {
    return appName.value.trim().length > 1
  }

   if (currentStep.value === 2) {
    return Object.values(paymentMethods.value).some(Boolean)
      && Number.isFinite(Number(dailySalesQuota.value))
      && Number(dailySalesQuota.value) > 0
      && Number.isFinite(Number(pointsMultiplier.value))
      && Number(pointsMultiplier.value) > 0
      && Number.isFinite(Number(expiryWarningDays.value))
      && Number(expiryWarningDays.value) > 0
      && Number.isFinite(Number(expiryCriticalDays.value))
      && Number(expiryCriticalDays.value) > 0
      && Number(expiryCriticalDays.value) <= Number(expiryWarningDays.value)
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
  loyaltyEnabled.value = template.customer?.enableLoyalty !== false
  requireCustomer.value = template.workflow?.requireCustomer === true || template.customer?.requireCustomerDetails === true
  pointsMultiplier.value = getTemplatePointsMultiplier(template)
  dailySalesQuota.value = getTemplateDailySalesQuota(template)
  const expirySettings = getTemplateExpiryAlertSettings(template)
  expiryWarningDays.value = expirySettings.warningDays
  expiryCriticalDays.value = expirySettings.criticalDays
  showProductChart.value = template.reporting?.showProductChart !== false
  showServiceChart.value = template.reporting?.showServiceChart !== false
  paymentMethods.value = {
    cash: (template.payments?.methods || ['cash', 'gcash']).includes('cash'),
    gcash: (template.payments?.methods || ['cash', 'gcash']).includes('gcash'),
  }
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

function togglePaymentMethod(method) {
  const nextValue = !paymentMethods.value[method]
  const enabledCount = Object.values(paymentMethods.value).filter(Boolean).length

  if (!nextValue && enabledCount <= 1) {
    return
  }

  paymentMethods.value = {
    ...paymentMethods.value,
    [method]: nextValue,
  }
}

function buildTemplateOverrides() {
  const productsEnabled = catalogMode.value !== 'services'
  const servicesEnabled = catalogMode.value !== 'products'
  const allowMixedItems = catalogMode.value === 'mixed'
  const canTrackStock = productsEnabled && trackStock.value
  const canTrackBatches = canTrackStock && trackBatches.value
  const canTrackExpiry = canTrackBatches && trackExpiry.value
  const methods = Object.entries(paymentMethods.value)
    .filter(([, enabled]) => enabled)
    .map(([method]) => method)
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
      requireCustomer: requireCustomer.value,
    },
    itemDefaults: {
      itemType: catalogMode.value === 'services' ? 'service' : 'product',
      trackStock: canTrackStock,
      trackBatches: canTrackBatches,
      trackExpiry: canTrackExpiry,
    },
    customer: {
      enableLoyalty: loyaltyEnabled.value,
      requireCustomerDetails: requireCustomer.value,
      pointsMultiplier: Number(pointsMultiplier.value),
    },
    payments: {
      methods: methods.length ? methods : ['cash'],
    },
    pages,
    reporting: {
      focus: selectedTemplate.value?.reporting?.focus || 'mixed',
      dailySalesQuota: Number(dailySalesQuota.value),
      expiryWarningDays: Number(expiryWarningDays.value),
      expiryCriticalDays: Number(expiryCriticalDays.value),
      showProductChart: productsEnabled ? showProductChart.value : false,
      showServiceChart: servicesEnabled ? showServiceChart.value : false,
    },
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

  if (value === 'products') {
    showServiceChart.value = false
    showProductChart.value = true
  } else if (value === 'services') {
    showProductChart.value = false
    showServiceChart.value = true
  } else {
    showProductChart.value = true
    showServiceChart.value = true
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

        <div class="option-group">
          <span class="group-label">Customer and loyalty</span>
          <div class="toggle-stack compact-stack">
            <label class="toggle-row">
              <input v-model="loyaltyEnabled" type="checkbox" />
              <div>
                <strong>Enable loyalty</strong>
                <span>Show customer points and redeem controls during checkout.</span>
              </div>
            </label>

            <label class="toggle-row">
              <input v-model="requireCustomer" type="checkbox" />
              <div>
                <strong>Require customer selection</strong>
                <span>Keep the customer section visible and require a customer before checkout.</span>
              </div>
            </label>
          </div>

          <div class="numeric-settings-grid">
            <label class="numeric-setting-card">
              <span>Customer points multiplier</span>
              <input
                v-model.number="pointsMultiplier"
                class="input"
                type="number"
                min="0.01"
                step="0.01"
                :disabled="!loyaltyEnabled"
              />
              <small>Set how much discount each redeemed point is worth.</small>
            </label>

            <label class="numeric-setting-card">
              <span>Daily sales quota</span>
              <input
                v-model.number="dailySalesQuota"
                class="input"
                type="number"
                min="1"
                step="1"
              />
              <small>Used by Analytics to mark when a day hits the target.</small>
            </label>

            <label class="numeric-setting-card">
              <span>Near-expiry warning window</span>
              <input
                v-model.number="expiryWarningDays"
                class="input"
                type="number"
                min="1"
                step="1"
                :disabled="!trackExpiry"
              />
              <small>Items with tracked expiry inside this many days are flagged in inventory and analytics.</small>
            </label>

            <label class="numeric-setting-card">
              <span>Urgent expiry window</span>
              <input
                v-model.number="expiryCriticalDays"
                class="input"
                type="number"
                min="1"
                step="1"
                :max="expiryWarningDays || undefined"
                :disabled="!trackExpiry"
              />
              <small>Use a smaller window for items that need stronger red alerts before expiry.</small>
            </label>
          </div>
        </div>

        <div class="option-group">
          <span class="group-label">Analytics charts</span>
          <div class="toggle-stack compact-stack">
            <label class="toggle-row">
              <input v-model="showProductChart" type="checkbox" :disabled="catalogMode === 'services'" />
              <div>
                <strong>Show product chart</strong>
                <span>Display the top products chart in Analytics when product sales are enabled.</span>
              </div>
            </label>

            <label class="toggle-row">
              <input v-model="showServiceChart" type="checkbox" :disabled="catalogMode === 'products'" />
              <div>
                <strong>Show service chart</strong>
                <span>Display the top services chart in Analytics when service sales are enabled.</span>
              </div>
            </label>
          </div>
        </div>

        <div class="option-group">
          <span class="group-label">Payment methods</span>
          <div class="page-chip-grid">
            <button
              type="button"
              :class="['page-chip', { active: paymentMethods.cash }]"
              @click="togglePaymentMethod('cash')"
            >
              <span class="page-chip-icon" aria-hidden="true">{{ paymentMethods.cash ? '✓' : '✕' }}</span>
              <span>{{ getTemplatePaymentLabel('cash', selectedTemplateLabels) }}</span>
            </button>

            <button
              type="button"
              :class="['page-chip', { active: paymentMethods.gcash }]"
              @click="togglePaymentMethod('gcash')"
            >
              <span class="page-chip-icon" aria-hidden="true">{{ paymentMethods.gcash ? '✓' : '✕' }}</span>
              <span>{{ getTemplatePaymentLabel('gcash', selectedTemplateLabels) }}</span>
            </button>
          </div>
          <p class="muted helper-copy">At least one payment method must stay enabled.</p>
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

          <article>
            <span>Customer and loyalty</span>
            <strong class="review-value review-value-break">
              {{ customizationSummary.loyaltyEnabled ? 'Loyalty on' : 'Loyalty off' }},
              {{ customizationSummary.requireCustomer ? 'customer required' : 'customer optional' }}
            </strong>
          </article>

          <article>
            <span>Payment methods</span>
            <strong class="review-value review-value-break">{{ customizationSummary.paymentMethods.join(', ') }}</strong>
          </article>

          <article>
            <span>Loyalty points value</span>
            <strong class="review-value">₱{{ Number(customizationSummary.pointsMultiplier || 0).toFixed(2) }} per point</strong>
          </article>

          <article>
            <span>Daily sales quota</span>
            <strong class="review-value">₱{{ Number(customizationSummary.dailySalesQuota || 0).toLocaleString() }}</strong>
          </article>

          <article>
            <span>Expiry alerts</span>
            <strong class="review-value review-value-break">
              {{ customizationSummary.trackExpiry
                ? `${Number(customizationSummary.expiryCriticalDays || 0)} day urgent / ${Number(customizationSummary.expiryWarningDays || 0)} day warning`
                : 'Disabled' }}
            </strong>
          </article>

          <article>
            <span>Analytics charts</span>
            <strong class="review-value review-value-break">
              {{ [
                customizationSummary.showProductChart ? 'products' : null,
                customizationSummary.showServiceChart ? 'services' : null,
              ].filter(Boolean).join(', ') || 'Hidden' }}
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
  padding: 32px 20px 48px;
  display: grid;
  gap: 24px;
  background:
    radial-gradient(circle at top left, rgba(26, 188, 156, 0.16), transparent 30%),
    radial-gradient(circle at top right, rgba(15, 23, 42, 0.08), transparent 22%),
    linear-gradient(180deg, #f4fbf8 0%, #eef4fb 100%);
}

.setup-shell,
.setup-shell *,
.setup-shell *::before,
.setup-shell *::after {
  box-sizing: border-box;
}

.setup-hero,
.setup-card {
  width: min(100%, 980px);
  max-width: 100%;
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
  line-height: 1.35;
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

.compact-stack {
  gap: 10px;
}

.helper-copy {
  font-size: 13px;
}

.numeric-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.numeric-setting-card {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid #dbe4ea;
  background: #f8fbfd;
}

.numeric-setting-card span {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.numeric-setting-card small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
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

@media (max-width: 1024px) {
  .setup-shell {
    padding: 24px 18px 36px;
    gap: 20px;
  }

  .setup-hero,
  .setup-card {
    padding: 24px;
    border-radius: 24px;
  }

  .setup-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .step-node {
    grid-template-columns: auto 1fr;
    justify-items: start;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    text-align: left;
    border-radius: 18px;
    background: rgba(248, 250, 252, 0.9);
    border: 1px solid rgba(203, 213, 225, 0.8);
  }

  .step-node span {
    width: 34px;
    height: 34px;
  }

  .template-grid,
  .page-chip-grid,
  .review-grid,
  .numeric-settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .segmented button,
  .page-chip {
    width: 100%;
  }

  .page-chip {
    justify-content: flex-start;
    text-align: left;
  }

  .setup-actions {
    gap: 10px;
  }

  .setup-actions button {
    flex: 1 1 0;
    min-width: 0;
  }
}

@media (max-width: 820px) {
  .setup-shell {
    padding: 20px 14px 32px;
  }

  .setup-hero,
  .setup-card {
    padding: 22px;
  }

  .template-grid,
  .page-chip-grid,
  .review-grid,
  .segmented,
  .numeric-settings-grid {
    grid-template-columns: 1fr;
  }

  .setup-actions {
    flex-direction: column-reverse;
  }

  .setup-actions button {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .setup-shell {
    padding: 16px 10px 24px;
  }

  .setup-hero,
  .setup-card {
    padding: 20px;
    border-radius: 22px;
  }

  .setup-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .step-node {
    padding: 10px 12px;
  }
}
</style>