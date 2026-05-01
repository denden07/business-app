<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import Swal from 'sweetalert2'
import { Capacitor } from '@capacitor/core'
import { dbPromise } from '../db'
import { collectFromSource } from '../db/query'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { summarizeExpiryForBatches, getSellableQuantityFromBatches } from '../utils/expiryAlerts'
import {
  findSaleOption,
  formatSaleOptionQuantity,
  getAvailableSaleOptions,
  getSaleOptionUnitQuantity,
} from '../utils/itemSaleOptions'
import { getTemplateExpiryAlertSettings, getTemplatePointsMultiplier } from '../utils/templatePresentation'
import { normalizeSalePaymentStatus } from '../utils/saleStatus'
import {
  defaultInteractionSettings,
  loadInteractionSettings,
} from '../utils/interactionPreferences'
import { formatCurrency } from '../utils/numberFormat'

const store = useStore()
const router = useRouter()
const route = useRoute()
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const templateWorkflow = computed(() => activeTemplate.value.workflow || {})
const templateCustomer = computed(() => activeTemplate.value.customer || {})
const templatePayments = computed(() => activeTemplate.value.payments || {})
const templateLabels = computed(() => activeTemplate.value.labels || {})
const allowProductSales = computed(() => templateWorkflow.value.allowProductSales !== false)
const allowServiceSales = computed(() => templateWorkflow.value.allowServiceSales !== false)
const requireCustomerSelection = computed(() => templateWorkflow.value.requireCustomer === true || templateCustomer.value.requireCustomerDetails === true)
const loyaltyEnabled = computed(() => templateCustomer.value.enableLoyalty !== false)
const showProfessionalFee = computed(() => allowServiceSales.value)
const professionalFeeLabel = computed(() => templateLabels.value.professionalFee || 'Additional Fee')
const showCustomerSection = computed(() => {
  return loyaltyEnabled.value || requireCustomerSelection.value
})
const customerSectionLabel = computed(() => templateLabels.value.customerSection || 'Sold to')
const customerActionLabel = computed(() => templateLabels.value.customerAction || 'Select Customer')
const paymentOptions = computed(() => {
  const configuredMethods = Array.isArray(templatePayments.value.methods) && templatePayments.value.methods.length
    ? templatePayments.value.methods
    : ['cash', 'gcash']

  return configuredMethods.map(method => ({
    value: method,
    label: method === 'gcash'
      ? (templateLabels.value.paymentGcash || 'Online Bank')
      : (templateLabels.value.paymentCash || 'Cash'),
  }))
})
const showPaymentMethodSelector = computed(() => paymentOptions.value.length > 1)
const paymentMethodLabel = computed(() => paymentOptions.value.find(option => option.value === paymentMethod.value)?.label || paymentOptions.value[0]?.label || 'Cash')
const defaultPointsMultiplier = computed(() => getTemplatePointsMultiplier(activeTemplate.value))
const expiryAlertSettings = computed(() => getTemplateExpiryAlertSettings(activeTemplate.value))
const mobileNumpadQuery = '(max-width: 1023px)'
const isMobileLayout = ref(false)
const catalogSearchLabel = computed(() => {
  if (allowProductSales.value && allowServiceSales.value) {
    return 'catalog items or services'
  }

  if (allowServiceSales.value) {
    return 'services'
  }

  return 'catalog items'
})
const searchPlaceholder = computed(() => {
  if (allowProductSales.value && allowServiceSales.value) {
    return 'Search catalog item or service...'
  }

  if (allowServiceSales.value) {
    return 'Search service...'
  }

  return 'Search catalog item...'
})
const noSearchResultsMessage = computed(() => `No ${catalogSearchLabel.value} found.`)

// ======================
// POS STATE
// ======================
const search = ref('')
const selectedMedicine = ref(null)
const selectedPriceType = ref('regular')
const cart = ref([])
const professionalFee = ref(0)
const moneyGiven = ref(0)
const selectedCustomer = ref(null)
const showCustomerModal = ref(false)
const customerSearch = ref('')
const newCustomer = ref({ name: '', phone: '', address: '' })

// ======================
// REDEEM POINTS
// ======================
const showRedeemModal = ref(false)
const customerPoints = ref(0)
const redeemMultiplier = ref(defaultPointsMultiplier.value)
const pointsConfirmed = ref(false)

// ======================
// SPECIAL DISCOUNT
// ======================
const showSpecialDiscountModal = ref(false)
const specialDiscount = ref(0)
const specialDiscountDraft = ref(0)
const specialDiscountNote = ref('')
const specialDiscountNoteDraft = ref('')

// ======================
// DRAFT SALES
// ======================
const activeDraftId = ref(null) // id of the draft currently loaded into the cart

const saveSaleAsDraft = async () => {
  if (!cart.value.length) {
    Swal.fire({ icon: 'warning', title: 'Cart is empty', text: 'Add items before saving as draft.', timer: 1500, showConfirmButton: false })
    return
  }
  try {
    const { value: name } = await Swal.fire({
      title: 'Save as Draft',
      input: 'text',
      inputPlaceholder: 'e.g. Patient name / Notes',
      inputLabel: 'Label (optional)',
      showCancelButton: true,
      confirmButtonText: 'Save Draft'
    })
    if (name === undefined) return

    const savedDraftId = await store.dispatch('drafts/save', {
      id: activeDraftId.value,
      name: name || `Draft ${new Date().toLocaleTimeString()}`,
      snapshot: {
        cart: JSON.parse(JSON.stringify(cart.value)),
        catalogMap: JSON.parse(JSON.stringify(catalogMap.value)),
        customer: selectedCustomer.value ? JSON.parse(JSON.stringify(selectedCustomer.value)) : null,
        professionalFee: professionalFee.value,
        moneyGiven: moneyGiven.value,
        pointsConfirmed: pointsConfirmed.value,
        redeemMultiplier: redeemMultiplier.value,
        customerPoints: customerPoints.value,
        specialDiscount: specialDiscount.value,
        specialDiscountNote: specialDiscountNote.value,
        paymentMethod: paymentMethod.value
      }
    })

    activeDraftId.value = savedDraftId ?? null

    cart.value = []
    professionalFee.value = 0
    moneyGiven.value = 0
    selectedCustomer.value = null
    resetRedeemState()
    specialDiscount.value = 0
    specialDiscountNote.value = ''
    customerPoints.value = 0
    paymentMethod.value = 'cash'
    activeDraftId.value = null

    await Swal.fire({ icon: 'success', title: 'Saved as draft!', timer: 1200, showConfirmButton: false })
  } catch (err) {
    console.error('Failed to save draft', err)
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: err.message || 'Unable to save the sale as draft.'
    })
  }
}

const resumeDraft = (draft) => {
  cart.value = (draft.cart || []).map(normalizeDraftCartItem)
  Object.assign(catalogMap.value, normalizeDraftCatalogMap(draft))
  selectedCustomer.value = draft.customer || null
  professionalFee.value = draft.professionalFee || 0
  moneyGiven.value = draft.moneyGiven || 0
  pointsConfirmed.value = draft.pointsConfirmed || false
  redeemMultiplier.value = draft.redeemMultiplier || defaultPointsMultiplier.value
  customerPoints.value = draft.customerPoints || 0
  specialDiscount.value = draft.specialDiscount || 0
  specialDiscountNote.value = draft.specialDiscountNote || ''
  paymentMethod.value = draft.paymentMethod || 'cash'
  activeDraftId.value = draft.id
}

onMounted(async () => {
  await loadFeedbackSettings()
  updateMobileLayout()
  const draftId = Number(route.query.draft)
  if (draftId) {
    const draft = await store.dispatch('drafts/getDraftById', draftId)
    if (draft) resumeDraft(draft)
  }

  window.addEventListener('interaction-settings-changed', handleInteractionSettingsChanged)
  window.addEventListener('resize', updateMobileLayout)
})

// ======================
// CUSTOMER MODAL
// ======================
const showNewCustomerForm = ref(false)

const pointsRedeemed = computed(() => pointsConfirmed.value ? customerPoints.value : 0)
const redeemedPointsDiscount = computed(() => pointsRedeemed.value * redeemMultiplier.value)
const pointsUsed = computed(() => redeemedPointsDiscount.value)
const pointsDiscount = computed(() => redeemedPointsDiscount.value + specialDiscount.value)

function resetRedeemState() {
  redeemMultiplier.value = defaultPointsMultiplier.value
  pointsConfirmed.value = false
}

// ======================
// Focus tracking for number pad
// ======================
const focusedItem = ref(null)
const focusedField = ref('')
const setActiveInput = (item, field) => {
  focusedItem.value = item
  focusedField.value = field
}

const getQtyInputStyle = (value) => {
  const digits = String(Math.max(0, Number(value) || 0)).length
  const widthCh = Math.max(2, digits) + 1.4

  return {
    width: `${widthCh}ch`,
    minWidth: '3.4rem',
  }
}

const updateMobileLayout = () => {
  if (typeof window === 'undefined') return
  isMobileLayout.value = window.matchMedia(mobileNumpadQuery).matches
}

const paymentMethod = ref('cash') // default
const interactionSettings = ref({ ...defaultInteractionSettings })
let numpadAudioContext = null

watch(paymentOptions, options => {
  const firstOption = options[0]?.value || 'cash'
  if (!options.some(option => option.value === paymentMethod.value)) {
    paymentMethod.value = firstOption
  }
}, { immediate: true })

watch(showProfessionalFee, visible => {
  if (!visible) {
    professionalFee.value = 0
    if (focusedField.value === 'professionalFee') {
      focusedField.value = ''
    }
  }
}, { immediate: true })

watch(showCustomerSection, visible => {
  if (!visible) {
    selectedCustomer.value = null
    showCustomerModal.value = false
    showRedeemModal.value = false
    customerPoints.value = 0
    redeemMultiplier.value = 1
    pointsConfirmed.value = false
  }
}, { immediate: true })

const buildCheckoutSummaryHtml = () => {
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const formatHtmlMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br />')

  const customerBlock = showCustomerSection.value
    ? `
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #2c5aa0;">
          <span>${customerSectionLabel.value}:</span>
          <span>${selectedCustomer.value ? selectedCustomer.value.name : 'Walk-in Customer'}</span>
        </div>
        ${selectedCustomer.value?.phone ? `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 13px; color: #4a6fa5;">
            <span>Phone:</span>
            <span>${selectedCustomer.value.phone}</span>
          </div>
        ` : ''}
      </div>
    `
    : ''

  const professionalFeeBlock = showProfessionalFee.value && professionalFee.value > 0
    ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>${professionalFeeLabel.value}:</span>
        <span>${formatCurrency(professionalFee.value)}</span>
      </div>
    `
    : ''

  const pointsBreakdown = loyaltyEnabled.value && pointsUsed.value > 0
    ? `
      <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 13px; color: #718096;">
        <span>• Points:</span>
        <span>-${formatCurrency(pointsUsed.value)}</span>
      </div>
    `
    : ''

  const specialDiscountBreakdown = specialDiscount.value > 0
    ? `
      <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 13px; color: #718096;">
        <span>• Special:</span>
        <span>-${formatCurrency(specialDiscount.value)}</span>
      </div>
      ${specialDiscountNote.value ? `
        <div style="padding: 6px 0 2px 16px; font-size: 13px; color: #718096; text-align: left;">
          <span style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b;">Discount Note:</span>
          <span style="display: block; line-height: 1.5; color: #718096;">${formatHtmlMultiline(specialDiscountNote.value)}</span>
        </div>
      ` : ''}
    `
    : ''

  const paymentStatus = normalizeSalePaymentStatus({
    final_total: grandTotal.value,
    money_given: moneyGiven.value,
    amount_paid: amountPaid.value,
    outstanding_balance: outstandingBalance.value,
  })
  const paymentStatusLabel = paymentStatus === 'paid'
    ? 'Paid'
    : paymentStatus === 'partial'
      ? 'Partial Debt'
      : 'Unpaid Debt'

  return `
    <div style="max-height: 40vh; overflow-y: auto; margin: 16px 0; border: 1px solid #ddd; border-radius: 4px;">
      <table style="width:100%; border-collapse: collapse; text-align: left;">
        <thead style="position: sticky; top: 0; background: #f5f5f5; z-index: 10;">
          <tr style="border-bottom: 2px solid #ddd;">
            <th style="padding: 8px;">Item</th>
            <th style="padding: 8px; text-align: center;">Qty</th>
            <th style="padding: 8px; text-align: right;">Price</th>
            <th style="padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
          ${cart.value.map(item => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px;">${item.name}<div style="margin-top: 2px; font-size: 12px; color: #64748b;">${getCartLineMeta(item)}</div></td>
              <td style="padding: 8px; text-align: center;">${getCartLineQuantityLabel(item)}</td>
              <td style="padding: 8px; text-align: right;">${formatCurrency(item.price)}</td>
              <td style="padding: 8px; text-align: right;">${formatCurrency(item.price * item.qty)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px;">
      ${customerBlock}
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Subtotal:</span>
        <span>${formatCurrency(subTotal.value)}</span>
      </div>
      ${professionalFeeBlock}
      ${pointsDiscount.value > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e53e3e;">
          <span>Discount:</span>
          <span>-${formatCurrency(pointsDiscount.value)}</span>
        </div>
        ${pointsBreakdown}
        ${specialDiscountBreakdown}
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Payment Method:</span>
        <span>${paymentMethodLabel.value}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Money Given:</span>
        <span>${formatCurrency(moneyGiven.value)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Amount Paid:</span>
        <span>${formatCurrency(amountPaid.value)}</span>
      </div>
      <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;" />
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 18px; font-weight: bold; color: #2d3748;">
        <span>Grand Total:</span>
        <span style="color: green;">${formatCurrency(grandTotal.value)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: 600; color: ${isDebtSale.value ? '#b45309' : '#2d3748'};">
        <span>Status:</span>
        <span>${paymentStatusLabel}</span>
      </div>
      ${isDebtSale.value ? `
        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 18px; font-weight: bold; color: #b45309;">
          <span>Balance Due:</span>
          <span>${formatCurrency(outstandingBalance.value)}</span>
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 18px; font-weight: bold; color: #2d3748;">
        <span>Change:</span>
        <span style="color: red;">${formatCurrency(change.value)}</span>
      </div>
    </div>
  `
}

const handleInteractionSettingsChanged = (event) => {
  interactionSettings.value = {
    ...defaultInteractionSettings,
    ...(event.detail || {}),
  }
}

const loadFeedbackSettings = async () => {
  try {
    interactionSettings.value = await loadInteractionSettings()
  } catch (err) {
    console.error('Failed to load interaction settings', err)
    interactionSettings.value = { ...defaultInteractionSettings }
  }
}

const getNumpadAudioContext = () => {
  if (typeof window === 'undefined') return null

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  if (!numpadAudioContext) {
    numpadAudioContext = new AudioContextClass()
  }

  return numpadAudioContext
}

const playNumpadTone = async (frequency = 760, duration = 0.045) => {
  if (!interactionSettings.value.soundEnabled) return

  const audioContext = getNumpadAudioContext()
  if (!audioContext) return

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const startAt = audioContext.currentTime
    const endAt = startAt + duration

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, startAt)

    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(0.09, startAt + 0.005)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start(startAt)
    oscillator.stop(endAt + 0.01)
  } catch {
    // Ignore platforms that block short synthesized UI sounds.
  }
}

const vibrateNumpad = async (style = ImpactStyle.Light) => {
  if (!interactionSettings.value.vibrationEnabled) return

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  const vibrationDuration = isNativeAndroid
    ? (style === ImpactStyle.Heavy ? 90 : style === ImpactStyle.Medium ? 72 : 56)
    : (style === ImpactStyle.Heavy ? 24 : style === ImpactStyle.Medium ? 18 : 12)

  if (isNativeAndroid) {
    try {
      await Haptics.vibrate({ duration: vibrationDuration })
      return
    } catch {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(vibrationDuration)
      }
      return
    }
  }

  try {
    await Haptics.impact({ style })
  } catch {
    // Fall through to explicit vibration for devices where impact feedback is unavailable.
  }

  try {
    await Haptics.vibrate({ duration: vibrationDuration })
    return
  } catch {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(vibrationDuration)
    }
  }
}

const triggerNumpadFeedback = (frequency, duration, hapticStyle = ImpactStyle.Light) => {
  void vibrateNumpad(hapticStyle)
  void playNumpadTone(frequency, duration)
}

const getSaleOptionList = (item) => {
  const entry = getCatalogEntry(item) || item || {}
  return getAvailableSaleOptions(entry, entry.saleOptions || [])
}

const getSelectedSaleOption = (item, optionKey = null) => {
  const entry = getCatalogEntry(item) || item || {}
  return findSaleOption(entry, entry.saleOptions || [], optionKey || item?.priceType || selectedPriceType.value)
}

const getCartLineBaseUnits = (item, qty = Number(item?.qty || 0)) => {
  const option = getSelectedSaleOption(item)
  return qty * getSaleOptionUnitQuantity(option || {})
}

const getCartLineMeta = (item) => {
  const option = getSelectedSaleOption(item)
  if (!option) return 'Regular'
  return `${option.label} • ${formatSaleOptionQuantity(option)}`
}

const getCartLineQuantityLabel = (item) => {
  const qty = Number(item.qty || 0)
  const baseUnits = getCartLineBaseUnits(item, qty)
  const option = getSelectedSaleOption(item)
  if (!option) return `${qty}`
  if (getSaleOptionUnitQuantity(option) === 1) return `${qty} pc${qty === 1 ? '' : 's'}`
  return `${qty} unit${qty === 1 ? '' : 's'} (${baseUnits} pcs)`
}

const shouldShowCartLineMeta = (item) => {
  const option = getSelectedSaleOption(item)
  return getSaleOptionUnitQuantity(option || {}) > 1
}

const warnStockOverflow = async (item, requestedQty, availableQty) => {
  const simulatedItem = { ...item, qty: requestedQty }
  await Swal.fire({
    icon: 'warning',
    title: 'Low Stock Warning',
    html: `<b>${item.name}</b><br/>Available: ${availableQty} pcs<br/>Requested: ${getCartLineQuantityLabel(simulatedItem)}<br/><br/>You are exceeding available stock!`,
    confirmButtonText: 'OK',
    timer: 2000,
    timerProgressBar: true,
  })
}

const setCartItemQty = async (item, nextQty) => {
  const normalizedQty = Math.max(0, Number(nextQty) || 0)
  const availableQty = getAvailableStock(item)

  item.qty = normalizedQty

  if (availableQty !== null && getCartLineBaseUnits(item, normalizedQty) > availableQty) {
    await warnStockOverflow(item, normalizedQty, availableQty)
  }
}

// ======================
// NUMBER PAD
// ======================
const appendNumber = async (num) => {
  triggerNumpadFeedback(760, 0.055, ImpactStyle.Heavy)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) {
    await setCartItemQty(focusedItem.value, Number(String(focusedItem.value.qty) + num))
  } else if (focusedField.value === 'professionalFee') {
    professionalFee.value = Number(String(professionalFee.value) + num)
  } else if (focusedField.value === 'moneyGiven') {
    moneyGiven.value = Number(String(moneyGiven.value) + num)
  }
}

const backspace = async () => {
  triggerNumpadFeedback(620, 0.06, ImpactStyle.Heavy)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) {
    await setCartItemQty(focusedItem.value, Number(String(focusedItem.value.qty).slice(0, -1) || 0))
  } else if (focusedField.value === 'professionalFee') {
    professionalFee.value = Number(String(professionalFee.value).slice(0, -1) || 0)
  } else if (focusedField.value === 'moneyGiven') {
    moneyGiven.value = Number(String(moneyGiven.value).slice(0, -1) || 0)
  }
}

const clearInput = async () => {
  triggerNumpadFeedback(480, 0.09, ImpactStyle.Heavy)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) await setCartItemQty(focusedItem.value, 1)
  else if (focusedField.value === 'professionalFee') professionalFee.value = 0
  else if (focusedField.value === 'moneyGiven') moneyGiven.value = 0
}

const incrementQty = async (item) => {
  triggerNumpadFeedback(760, 0.055, ImpactStyle.Heavy)
  await setCartItemQty(item, Number(item.qty || 0) + 1)
}

const decrementQty = (item) => {
  triggerNumpadFeedback(620, 0.06, ImpactStyle.Heavy)
  item.qty = Math.max(1, item.qty - 1)
}

const selectPaymentMethod = (method) => {
  triggerNumpadFeedback(700, 0.05, ImpactStyle.Heavy)
  paymentMethod.value = method
}

const selectItemPriceType = (item, type) => {
  triggerNumpadFeedback(type === 'regular' ? 720 : 680, 0.05, ImpactStyle.Heavy)
  setPriceType(item, type)
}

const SEARCH_RESULT_LIMIT = 20

// ======================
// ITEM SEARCH + MASTER CATALOG CACHE
// ======================
const catalogMap = ref({})
const filteredCatalog = ref([])
let catalogSearchRequestId = 0

const isCatalogItemAllowedByTemplate = (item) => {
  const itemType = item?.item_type === 'service' ? 'service' : 'product'

  if (itemType === 'service') {
    return allowServiceSales.value
  }

  return allowProductSales.value
}

const isInventoryTracked = (item) => {
  if (!item || item.item_type === 'service') {
    return false
  }

  return item.track_stock !== false || item.track_expiry === true
}

watch(search, async (val) => {
  const requestId = ++catalogSearchRequestId
  const q = val.trim().toLowerCase()
  if (!q) {
    filteredCatalog.value = []
    return
  }

  const db = await dbPromise
  const tx = db.transaction(['items', 'item_batches', 'item_sale_options'], 'readonly')
  const itemsStore = tx.objectStore('items')
  const itemBatchIndex = tx.objectStore('item_batches').index('item_id')
  const saleOptionIndex = tx.objectStore('item_sale_options').index('item_id')
  const matches = []
  const nextCatalogEntries = {}

  let cursor = await itemsStore.openCursor()
  while (cursor) {
    const item = cursor.value
    if (!isCatalogItemAllowedByTemplate(item)) {
      cursor = await cursor.continue()
      continue
    }

    const name = (item.name || '').toLowerCase()
    const description = (item.description || '').toLowerCase()
    const matchesQuery = name.startsWith(q) || description.startsWith(q)

    if (matchesQuery) {
      const totalStock = isInventoryTracked(item)
        ? await collectFromSource(itemBatchIndex, { query: item.id })
        : null
      const expirySummary = Array.isArray(totalStock)
        ? summarizeExpiryForBatches(totalStock, {
            trackExpiry: !!item.track_expiry,
            ...expiryAlertSettings.value,
          })
        : { tracked: false, status: 'not-tracked', label: 'Not tracked' }
      const sellableStock = Array.isArray(totalStock)
        ? getSellableQuantityFromBatches(totalStock, {
            trackExpiry: !!item.track_expiry,
            ...expiryAlertSettings.value,
          })
        : null
      const saleOptions = await collectFromSource(saleOptionIndex, { query: IDBKeyRange.only(item.id) })

      const entry = {
        ...item,
        sourceType: 'item',
        sourceId: item.id,
        cartKey: `item:${item.id}`,
        quantity: sellableStock,
        generic_name: '',
        saleOptions,
        expirySummary,
        stockIndicator: getStockIndicator({
          quantity: sellableStock,
          track_stock: item.track_stock,
          track_expiry: item.track_expiry,
          item_type: item.item_type,
          expirySummary,
        })
      }

      matches.push(entry)
      nextCatalogEntries[entry.cartKey] = entry
    }

    cursor = await cursor.continue()
  }

  // Sort exact prefix matches by name first, then secondary label.
  matches.sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aSecondary = (a.generic_name || a.description || '').toLowerCase()
    const bSecondary = (b.generic_name || b.description || '').toLowerCase()
    
    const aStartsWithSearch = aName.startsWith(q) || aSecondary.startsWith(q)
    const bStartsWithSearch = bName.startsWith(q) || bSecondary.startsWith(q)
    
    if (aStartsWithSearch && bStartsWithSearch) {
      return aName.localeCompare(bName)
    }
    if (!aStartsWithSearch && !bStartsWithSearch) {
      return aName.localeCompare(bName)
    }
    
    return aStartsWithSearch ? -1 : 1
  })

  if (requestId !== catalogSearchRequestId) return

  Object.assign(catalogMap.value, nextCatalogEntries)
  filteredCatalog.value = matches.slice(0, SEARCH_RESULT_LIMIT)
})

// ======================
// CUSTOMERS SEARCH (ACCURATE POINTS)
// ======================
const filteredCustomers = ref([])

watch(customerSearch, async (val) => {
  const q = val.trim().toLowerCase()
  if (!q) {
    filteredCustomers.value = []
    return
  }

  const db = await dbPromise
  const customersStore = db.transaction(['customers', 'yearly_points'], 'readonly').objectStore('customers')
  const matches = []

  let cursor = await customersStore.openCursor()
  while (cursor) {
    const customer = cursor.value
    const matchesQuery =
      (customer.name || '').toLowerCase().startsWith(q) ||
      (customer.phone || '').startsWith(q)

    if (matchesQuery) {
      matches.push({ ...customer })
      if (matches.length >= SEARCH_RESULT_LIMIT) {
        break
      }
    }

    cursor = await cursor.continue()
  }

  const year = new Date().getFullYear()
  const yearlyStore = db.transaction('yearly_points').objectStore('yearly_points')

  for (const c of matches) {
    const yearly = await yearlyStore.get([c.id, year])
    c.points = yearly?.points || 0
  }

  filteredCustomers.value = matches
})

// ======================
// CART LOGIC
// ======================
const addToCart = async (catalogItem) => {
  if (!isCatalogItemAllowedByTemplate(catalogItem)) {
    await Swal.fire({
      icon: 'warning',
      title: 'Unavailable for this template',
      text: `${catalogItem.name} is not allowed by the active template profile.`,
    })
    return
  }

  const saleOption = getSelectedSaleOption(catalogItem, selectedPriceType.value)
  if (!saleOption) return

  const price = Number(saleOption.price || 0)

  const existing = cart.value.find(i => i.cartKey === catalogItem.cartKey && i.priceType === saleOption.key)
  const currentStock = getAvailableStock(catalogItem)
  const cartQty = existing ? existing.qty : 0
  const newQty = cartQty + 1

  if (currentStock !== null && (newQty * getSaleOptionUnitQuantity(saleOption)) > currentStock) {
    await warnStockOverflow(catalogItem, newQty, currentStock)
  }

  if (existing) await setCartItemQty(existing, newQty)
  else cart.value.push({
    id: catalogItem.sourceId,
    sourceId: catalogItem.sourceId,
    sourceType: 'item',
    cartKey: catalogItem.cartKey,
    item_id: catalogItem.sourceId,
    medicine_id: null,
    name: catalogItem.name,
    generic_name: '',
    description: catalogItem.description || '',
    item_type: catalogItem.item_type || 'product',
    track_stock: !!catalogItem.track_stock,
    saleOptions: catalogItem.saleOptions || [],
    priceType: saleOption.key,
    saleOptionId: saleOption.isBuiltIn ? null : saleOption.id,
    saleOptionLabel: saleOption.label,
    saleOptionUnitQuantity: getSaleOptionUnitQuantity(saleOption),
    price,
    qty: 1
  })

  search.value = ''
  filteredCatalog.value = []
}


const setPriceType = (item, type) => {
  const option = getSelectedSaleOption(item, type)
  if (!option) return
  item.priceType = option.key
  item.price = Number(option.price || 0)
  item.saleOptionId = option.isBuiltIn ? null : option.id
  item.saleOptionLabel = option.label
  item.saleOptionUnitQuantity = getSaleOptionUnitQuantity(option)
}


const removeItem = (cartItem) => {
  cart.value = cart.value.filter(i => !(i.cartKey === cartItem.cartKey && i.priceType === cartItem.priceType))
}


const getPrice = (itemId, type) => {
  const catalogEntry = filteredCatalog.value.find(item => item.sourceId === itemId) || cart.value.find(item => item.id === itemId)
  if (!catalogEntry) return '0.00'
  const option = getSelectedSaleOption(catalogEntry, type)
  return Number(option?.price || 0).toFixed(2)
}


// ======================
// TOTALS
// ======================
const subTotal = computed(() => cart.value.reduce((sum, i) => sum + i.price * i.qty, 0))
const grandTotal = computed(() => Math.max(subTotal.value + Number(professionalFee.value || 0) - Number(pointsDiscount.value || 0), 0))
const amountPaid = computed(() => Math.min(Math.max(Number(moneyGiven.value || 0), 0), grandTotal.value))
const outstandingBalance = computed(() => Math.max(grandTotal.value - amountPaid.value, 0))
const isDebtSale = computed(() => outstandingBalance.value > 0)
const change = computed(() => Math.max((moneyGiven.value || 0) - grandTotal.value, 0))

// ======================
// REDEEM FLOW
// ======================
const openRedeemModal = () => {
  if (!selectedCustomer.value) return Swal.fire('Select customer first')
  redeemMultiplier.value = defaultPointsMultiplier.value
  showRedeemModal.value = true
}

const confirmPoints = () => {
  pointsConfirmed.value = true
  showRedeemModal.value = false
}

const removePoints = () => {
  resetRedeemState()
}

// ======================
// SPECIAL DISCOUNT
// ======================
const openSpecialDiscountModal = () => {
  specialDiscountDraft.value = Number(specialDiscount.value || 0)
  specialDiscountNoteDraft.value = specialDiscountNote.value || ''
  showSpecialDiscountModal.value = true
}

const applySpecialDiscount = () => {
  const amount = Number(specialDiscountDraft.value || 0)
  specialDiscount.value = Math.max(Number.isFinite(amount) ? amount : 0, 0)
  specialDiscountNote.value = specialDiscount.value > 0 ? String(specialDiscountNoteDraft.value || '').trim() : ''
  showSpecialDiscountModal.value = false
}

const removeSpecialDiscount = () => {
  specialDiscount.value = 0
  specialDiscountDraft.value = 0
  specialDiscountNote.value = ''
  specialDiscountNoteDraft.value = ''
}

// ======================
// CHECKOUT & SAVE SALE
// ======================
const checkout = async () => {
  if (!cart.value.length)
    return Swal.fire({
      icon: 'warning',
      title: 'Empty cart',
      text: 'Please add items before saving the sale.'
    })

  if (requireCustomerSelection.value && !selectedCustomer.value) {
    return Swal.fire({
      icon: 'warning',
      title: 'Customer required',
      text: 'Select a customer before saving the sale.',
    })
  }

  if (isDebtSale.value && showCustomerSection.value && !selectedCustomer.value) {
    return Swal.fire({
      icon: 'warning',
      title: 'Customer required for debt sale',
      text: 'Select a customer before saving a debt sale so the balance can be tracked.',
    })
  }

  // Check stock and warn for all items exceeding available quantity
  const stockWarnings = []
  for (const item of cart.value) {
    const available = getAvailableStock(item)
    const baseUnits = getCartLineBaseUnits(item)
    if (available !== null && baseUnits > available) {
      const shortage = baseUnits - available
      stockWarnings.push(`<b>${item.name}</b>: Need ${getCartLineQuantityLabel(item)}, Available ${available} pcs (Short by ${shortage})`)
    }
  }
  
  if (stockWarnings.length) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Stock Warning',
      html: `The following items exceed available stock:<br/><br/>${stockWarnings.join('<br/>')}<br/><br/>Inventory will go negative. Continue?`,
      showCancelButton: true,
      confirmButtonText: 'Proceed Anyway',
      cancelButtonText: 'Review Cart'
    })
    
    if (!result.isConfirmed) return
  }

  if (isDebtSale.value) {
    const debtFlowResult = await Swal.fire({
      icon: 'warning',
      title: 'Continue as debt sale?',
      html: `This sale is short by <strong>${formatCurrency(outstandingBalance.value)}</strong> and will be recorded as debt under the selected customer.`,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      cancelButtonText: 'Back to Cart',
    })

    if (!debtFlowResult.isConfirmed) return
  }

  // Confirmation with detailed breakdown
  const itemsTable = buildCheckoutSummaryHtml()
  const confirmTitle = isDebtSale.value ? 'Confirm Debt Sale' : 'Confirm Checkout'
  const confirmButtonText = isDebtSale.value ? 'Save Debt Sale' : 'Yes, Save Sale'
  
  const confirmResult = await Swal.fire({
    title: confirmTitle,
    html: itemsTable,
    icon: 'question',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText,
    denyButtonText: 'Save as Draft',
    cancelButtonText: 'Cancel',
    width: '96%',
    heightAuto: true,
    allowOutsideClick: false,
    customClass: {
      popup: 'swal-wide'
    }
  })

  if (confirmResult.isDenied) {
    await saveSaleAsDraft()
    return
  }

  if (!confirmResult.isConfirmed) return

  try {
    const saleId = await store.dispatch('sales/saveSale', {
      cart: cart.value,
      subTotal: subTotal.value,
      professionalFee: professionalFee.value,
      discount: pointsDiscount.value,
      finalTotal: grandTotal.value,
      customer_id: selectedCustomer.value?.id || null,
      moneyGiven: moneyGiven.value,
      change: change.value,
      purchased_date: new Date().toISOString(),

      // Points
      pointsUsed: pointsRedeemed.value,
      pointsMultiplier: redeemMultiplier.value,
      pointsDiscount: redeemedPointsDiscount.value,
      special_discount_note: specialDiscountNote.value,
      payment_method: paymentMethod.value,
    })

    Swal.fire({
      icon: 'success',
      title: isDebtSale.value ? 'Debt Sale Saved' : 'Sale Completed',
      text: isDebtSale.value
        ? `Sale #${saleId} saved with ${formatCurrency(outstandingBalance.value)} balance due`
        : `Sale #${saleId} saved`,
      timer: 1500,
      showConfirmButton: false
    })

    // Reset POS
    cart.value = []
    professionalFee.value = 0
    moneyGiven.value = 0
    selectedCustomer.value = null
    customerPoints.value = 0
    resetRedeemState()
    specialDiscount.value = 0
    specialDiscountNote.value = ''

    // If this sale came from a draft, delete it now that it's complete
    if (activeDraftId.value !== null) {
      await store.dispatch('drafts/remove', activeDraftId.value)
      activeDraftId.value = null
    }

  } catch (err) {
    console.error(err)
    Swal.fire({ icon: 'error', title: 'Checkout Failed', text: err.message || 'Something went wrong.' })
  }
}


// ======================
// SELECT CUSTOMER
// ======================
const selectCustomer = async (cust) => {
  const db = await dbPromise

  // load full customer
  const fullCustomer = await db.get('customers', cust.id)
  selectedCustomer.value = fullCustomer
  showCustomerModal.value = false

  const year = new Date().getFullYear()

  // 🔁 READ ONLY FROM yearly_points (single source of truth)
  const yearly = await db
    .transaction('yearly_points')
    .objectStore('yearly_points')
    .get([cust.id, year])

  customerPoints.value = yearly?.points || 0

  resetRedeemState()
}


// ======================
// ADD CUSTOMER
// ======================
const addCustomer = async () => {
  if (!newCustomer.value.name) return

  const id = await store.dispatch('customers/addCustomer', newCustomer.value)
  selectedCustomer.value = { id, ...newCustomer.value }

  customerPoints.value = 0
  resetRedeemState()

  newCustomer.value = { name:'', phone:'', address:'' }
  showCustomerModal.value = false
}

// Clear modal-local inputs when modals are closed
watch(showCustomerModal, (open) => {
  if (!open) {
    customerSearch.value = ''
    showNewCustomerForm.value = false
    newCustomer.value = { name: '', phone: '', address: '' }
    filteredCustomers.value = []
  }
})

watch(showRedeemModal, (open) => {
  if (!open && !pointsConfirmed.value) {
    redeemMultiplier.value = defaultPointsMultiplier.value
  }
})

watch(defaultPointsMultiplier, value => {
  if (!pointsConfirmed.value) {
    redeemMultiplier.value = value
  }
})

watch(selectedCustomer, value => {
  if (!value) {
    customerPoints.value = 0
    resetRedeemState()
  }
})

watch(showSpecialDiscountModal, (open) => {
  if (!open) {
    specialDiscountDraft.value = Number(specialDiscount.value || 0)
    specialDiscountNoteDraft.value = specialDiscountNote.value || ''
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('interaction-settings-changed', handleInteractionSettingsChanged)
  window.removeEventListener('resize', updateMobileLayout)

  if (numpadAudioContext && numpadAudioContext.state !== 'closed') {
    numpadAudioContext.close().catch(() => {})
  }
  numpadAudioContext = null
})

const getStockIndicator = (item) => {
  if (!isInventoryTracked(item) || item.item_type === 'service') {
    return { icon: '', color: 'blue', text: item.item_type === 'service' ? 'Service' : 'Product', quantity: null }
  }
  if (item.expirySummary?.status === 'expired') {
    return {
      icon: '▲!',
      color: 'red',
      text: `Sellable stock: ${Number(item.quantity || 0)}`,
      detail: `Expired qty: ${Number(item.expirySummary.expiredQuantity || 0)}`,
      quantity: item.quantity,
    }
  }
  if (item.expirySummary?.status === 'critical') {
    return {
      icon: '▲!',
      color: 'orange',
      text: `Sellable stock: ${Number(item.quantity || 0)}`,
      detail: item.expirySummary.label,
      quantity: item.quantity,
    }
  }
  if (item.expirySummary?.status === 'warning') {
    return {
      icon: '▲',
      color: 'orange',
      text: `Sellable stock: ${Number(item.quantity || 0)}`,
      detail: item.expirySummary.label,
      quantity: item.quantity,
    }
  }
  if (!item.quantity || item.quantity <= 0) {
    return { icon: '▲!', color: 'red', text: 'Out of stock', quantity: 0 }
  } else if (item.quantity < 10) {
    return { icon: '▲', color: 'orange', text: `Low stock: ${item.quantity}`, quantity: item.quantity }
  } else {
    return { icon: '', color: 'green', text: `Stock: ${item.quantity}`, quantity: item.quantity }
  }
}

const buildCatalogKey = (item) => {
  const sourceType = 'item'
  const sourceId = item?.sourceId ?? item?.item_id ?? item?.medicine_id ?? item?.id
  return sourceId !== undefined && sourceId !== null ? `${sourceType}:${sourceId}` : ''
}

const getCatalogEntry = (item) => {
  const key = item?.cartKey || buildCatalogKey(item)
  return key ? catalogMap.value[key] : null
}

const getAvailableStock = (item) => {
  const catalogEntry = getCatalogEntry(item)
  if (!catalogEntry || !isInventoryTracked(catalogEntry) || catalogEntry.item_type === 'service') {
    return null
  }
  return Number(catalogEntry.quantity || 0)
}

const getCartBaseUnitsForCatalogItem = (item) => {
  const cartKey = item?.cartKey || buildCatalogKey(item)
  return cart.value.reduce((sum, cartItem) => {
    if (cartItem.cartKey !== cartKey) {
      return sum
    }

    return sum + getCartLineBaseUnits(cartItem)
  }, 0)
}

const shouldShowQtyStockAlert = (item) => {
  const availableStock = getAvailableStock(item)
  if (availableStock === null) {
    return false
  }

  return getCartBaseUnitsForCatalogItem(item) >= availableStock
}

const normalizeDraftCatalogMap = (draft) => {
  const normalizedMap = {}

  for (const entry of Object.values(draft?.catalogMap || {})) {
    const sourceId = Number(entry.sourceId ?? entry.item_id ?? entry.medicine_id ?? entry.id)
    if (!Number.isFinite(sourceId)) continue

    normalizedMap[`item:${sourceId}`] = {
      ...entry,
      sourceType: 'item',
      sourceId,
      item_id: sourceId,
      medicine_id: null,
      cartKey: `item:${sourceId}`,
      description: entry.description || entry.generic_name || '',
      generic_name: '',
      item_type: entry.item_type || 'product',
      track_stock: entry.track_stock === false ? false : true,
      saleOptions: entry.saleOptions || [],
    }
  }

  for (const entry of Object.values(draft?.medicinesMap || {})) {
    const sourceId = Number(entry.sourceId ?? entry.id)
    if (!Number.isFinite(sourceId)) continue

    normalizedMap[`item:${sourceId}`] = {
      ...entry,
      sourceType: 'item',
      sourceId,
      item_id: sourceId,
      medicine_id: null,
      cartKey: `item:${sourceId}`,
      description: entry.description || entry.generic_name || '',
      generic_name: '',
      item_type: 'product',
      track_stock: entry.track_stock === false ? false : true,
      saleOptions: entry.saleOptions || [],
    }
  }

  return normalizedMap
}

const normalizeDraftCartItem = (item) => {
  const sourceType = 'item'
  const sourceId = Number(item.sourceId ?? item.item_id ?? item.medicine_id ?? item.id)

  return {
    ...item,
    id: sourceId,
    sourceId,
    sourceType,
    cartKey: item.cartKey || `${sourceType}:${sourceId}`,
    item_id: sourceId,
    medicine_id: null,
    item_type: item.item_type || 'product',
    description: item.description || item.generic_name || '',
    generic_name: '',
    track_stock: !!item.track_stock,
    saleOptions: item.saleOptions || [],
    saleOptionId: item.saleOptionId ?? null,
    saleOptionLabel: item.saleOptionLabel || '',
    saleOptionUnitQuantity: Number(item.saleOptionUnitQuantity || 1),
  }
}

const getPriceOptions = (item) => getSaleOptionList(item)
const usePriceOptionDropdown = (item) => getPriceOptions(item).length >= 3

const getPriceOptionLabel = (item, optionKey) => {
  const option = getSelectedSaleOption(item, optionKey)
  if (!option) return '—'
  const quantityLabel = getSaleOptionUnitQuantity(option) === 1 ? '' : ` / ${formatSaleOptionQuantity(option)}`
  return `${option.label} ${formatCurrency(Number(option.price || 0))}${quantityLabel}`
}


</script>

<template>
<div class="home-view">
 <h1>Calculator</h1>
<div class="pos-layout">
  <div class="catalog-panel">
    <div class="search-section">
      <SearchInput v-model="search" :placeholder="searchPlaceholder" :inputClass="'input pos-search-input'" />
      
      <div v-if="search && filteredCatalog.length" class="dropdown">
        <div v-for="catalogItem in filteredCatalog" :key="catalogItem.cartKey" class="dropdown-item" @click="addToCart(catalogItem)">
          <div class="dropdown-item-content">
            <div class="dropdown-item-copy">
              <div class="catalog-name">{{ catalogItem.name }}</div>
              <div class="catalog-meta" v-if="catalogItem.generic_name || catalogItem.description">{{ catalogItem.generic_name || catalogItem.description }}</div>
            </div>

            <div
              v-if="isInventoryTracked(catalogItem) || catalogItem.item_type === 'service' || catalogItem.item_type === 'product'"
              class="stock-indicator" 
              :title="catalogItem.stockIndicator.text"
              :class="{
                'out-of-stock': isInventoryTracked(catalogItem) && (catalogItem.stockIndicator.color === 'red' || catalogItem.quantity <= 0),
                'low-stock': isInventoryTracked(catalogItem) && catalogItem.stockIndicator.color === 'orange',
                'normal-stock': !isInventoryTracked(catalogItem) || catalogItem.quantity >= 10
              }"
            >
              <span v-if="isInventoryTracked(catalogItem)" class="stock-indicator-text">{{ catalogItem.stockIndicator.text }}</span>
              <small v-if="catalogItem.stockIndicator.detail" class="stock-indicator-detail">{{ catalogItem.stockIndicator.detail }}</small>
              <span v-else class="stock-indicator-text">{{ catalogItem.item_type === 'service' ? 'Service' : 'Product' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="search" class="dropdown dropdown-empty">
        <div class="dropdown-empty-copy">{{ noSearchResultsMessage }}</div>
      </div>
    </div>

    <div class="cart-wrapper">
    <div class="cart-table-container">
      <table v-if="cart.length">
        <thead>
          <tr>
            <th width="25%">Item</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in cart" :key="`${item.cartKey}:${item.priceType}`">
            <td data-label="Item">
              <div class="cart-item-name">{{ item.name }}</div>
            
            </td>
            <td data-label="Price">
<div class="price-toggle">
  <select
    v-if="isMobileLayout || usePriceOptionDropdown(item)"
    class="select-field price-option-select"
    :value="item.priceType"
    @change="selectItemPriceType(item, $event.target.value)"
  >
    <option v-for="option in getPriceOptions(item)" :key="option.key" :value="option.key">
      {{ getPriceOptionLabel(item, option.key) }}
    </option>
  </select>

  <template v-else>
    <button
      v-for="option in getPriceOptions(item)"
      :key="option.key"
      class="price-option-btn"
      :class="{ active: item.priceType === option.key, inactive: item.priceType !== option.key }"
      @click="selectItemPriceType(item, option.key)"
    >
      {{ getPriceOptionLabel(item, option.key) }}
    </button>
  </template>
</div>

            </td>
            <td data-label="Qty">
              <div class="qty-wrapper">
                <button class="qty-step-btn qty-step-btn-decrement" @click="decrementQty(item)">-</button>
                <input
                  style="font-weight: bold"
                  type="number"
                  :value="item.qty"
                  :readonly="!isMobileLayout"
                  @click="setActiveInput(item,'qty')"
                  @input="setCartItemQty(item, $event.target.value)"
                  :style="getQtyInputStyle(item.qty)"
                  :class="{ 'active-input': focusedField==='qty' && focusedItem===item }"
                />
                <div class="qty-add-wrap">
                  <button class="qty-step-btn" @click="incrementQty(item)">+</button>
                  <span
                    v-if="shouldShowQtyStockAlert(item)"
                    class="qty-stock-alert"
                    title="No stock left"
                  >
                    !
                  </span>
                </div>
              </div>
              <div v-if="shouldShowCartLineMeta(item)" class="catalog-meta">{{ getCartLineQuantityLabel(item) }}</div>
            </td>
            <td data-label="Total">{{ formatCurrency(item.price * item.qty) }}</td>
            <td class="cart-actions-cell">
              <button class="mini danger remove-cart-item-btn" @click="removeItem(item)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>No items</p>
    </div>

    <!-- Totals -->
    <div v-if="!isMobileLayout" class="cart-totals">
      <div>
        <span>Subtotal</span>
        <strong>{{ formatCurrency(subTotal) }}</strong>
      </div>

      <div>
        <span style="display: flex; align-items: center; justify-content: center; gap: 4px;">
          Discount
          <button 
            class="discount-add-btn" 
            @click="openSpecialDiscountModal"
            title="Add special discount"
          >+</button>
        </span>
        <strong>-{{ formatCurrency(pointsDiscount) }}</strong>
      </div>

      <div class="grand">
        <span><strong>Grand Total</strong></span>
        <strong>{{ formatCurrency(grandTotal) }}</strong>
      </div>

      <div class="change">
        <span><strong>Change</strong></span>
        <strong>{{ formatCurrency(change) }}</strong>
      </div>
    </div>

    </div>
  </div>

  <div class="pos-side-panel">
    <div v-if="showCustomerSection" class="sold-to">
      <div class="customer-section">
        <label><strong>{{ customerSectionLabel }}:</strong></label>
        <div class="customer-display">
          <span v-if="selectedCustomer" class="customer-name">
            👤 {{ selectedCustomer.name }} 
          </span>
          <button v-if="!selectedCustomer" class="btn select-customer" @click="showCustomerModal=true">
            {{ customerActionLabel }}
          </button>
          <button style="margin-left: 8px" v-if="selectedCustomer" class="mini danger" @click="selectedCustomer=null">✕</button>
        </div>

        <div v-if="loyaltyEnabled && selectedCustomer" class="redeem-section">
          <button 
            v-if="!pointsConfirmed" 
            class="mini regular" 
            @click="openRedeemModal"
          >
            🎁 Redeem
          </button>

          <button 
            v-if="pointsConfirmed" 
            class="mini danger" 
            @click="removePoints"
          >
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="right-panel" :class="{ 'right-panel-mobile': isMobileLayout }">
    <div v-if="isMobileLayout" class="mobile-checkout-header">
      <div>
        <p class="mobile-checkout-kicker">Mobile Checkout</p>
        <h2>Use your keyboard for payment entry</h2>
      </div>
      <p class="mobile-checkout-help">Tap any amount field or item quantity to type directly.</p>
    </div>

    <div class="checkout-inputs" :class="{ 'checkout-inputs-mobile': isMobileLayout }">
      <label v-if="showProfessionalFee" class="checkout-field" :class="{ 'checkout-field-mobile': isMobileLayout }">
        <span>{{ professionalFeeLabel }}</span>
        <input
          type="number"
          inputmode="decimal"
          :value="professionalFee"
          :readonly="!isMobileLayout"
          @click="setActiveInput(null,'professionalFee')"
          @input="professionalFee = Number($event.target.value || 0)"
          :class="{ 'active-input': focusedField==='professionalFee' }"
        />
      </label>

      <label class="checkout-field" :class="{ 'checkout-field-mobile': isMobileLayout }">
        <span>Money Given</span>
        <input
          type="number"
          inputmode="decimal"
          :value="moneyGiven"
          :readonly="!isMobileLayout"
          @click="setActiveInput(null,'moneyGiven')"
          @input="moneyGiven = Number($event.target.value || 0)"
          :class="{ 'active-input': focusedField==='moneyGiven' }"
        />
      </label>
    </div>

    <div v-if="isMobileLayout" class="mobile-cart-totals">
      <div>
        <span>Subtotal</span>
        <strong>{{ formatCurrency(subTotal) }}</strong>
      </div>
      <div>
        <span style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <span>Discount</span>
          <button
            class="discount-add-btn"
            @click="openSpecialDiscountModal"
            title="Add special discount"
          >+</button>
        </span>
        <strong>-{{ formatCurrency(pointsDiscount) }}</strong>
      </div>
      <div>
        <span>Change</span>
        <strong>{{ formatCurrency(change) }}</strong>
      </div>
      <div class="mobile-cart-total-emphasis">
        <span>Grand Total</span>
        <strong>{{ formatCurrency(grandTotal) }}</strong>
      </div>
    </div>

    <!-- Number Pad (reordered: 7-9 top, 1-3 bottom) -->
    <div v-if="!isMobileLayout" class="number-pad">
      <button class="num-btn" @click="appendNumber(7)">7</button>
      <button class="num-btn" @click="appendNumber(8)">8</button>
      <button class="num-btn" @click="appendNumber(9)">9</button>
      <button class="num-btn" @click="appendNumber(4)">4</button>
      <button class="num-btn" @click="appendNumber(5)">5</button>
      <button class="num-btn" @click="appendNumber(6)">6</button>
      <button class="num-btn" @click="appendNumber(1)">1</button>
      <button class="num-btn" @click="appendNumber(2)">2</button>
      <button class="num-btn" @click="appendNumber(3)">3</button>
      <button class="num-btn" @click="clearInput">C</button>
      <button class="num-btn" @click="appendNumber(0)">0</button>
      <button class="num-btn" @click="backspace">←</button>
    </div>

    <div v-if="showPaymentMethodSelector" class="payment-toggle" :class="{ 'payment-toggle-mobile': isMobileLayout }">
      <button
        v-for="option in paymentOptions"
        :key="option.value"
        class="payment-option-btn"
        :class="{ active: paymentMethod === option.value, 'payment-option-btn-mobile': isMobileLayout }"
        @click="selectPaymentMethod(option.value)"
      >
        {{ option.label }}
      </button>
    </div>


    <button class="btn checkout" @click="checkout">Save Sale</button>
    </div>
  </div>
</div>

<!-- CUSTOMER MODAL -->
<div v-if="showCustomerSection && showCustomerModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm modal-customer">
    <h3>Select Customer</h3>

    <SearchInput v-model="customerSearch" placeholder="Search customer..." wrapperClass="full" :inputClass="'input pos-search-input'" />

    <div v-if="customerSearch && filteredCustomers.length" class="customer-list">
      <div
        v-for="c in filteredCustomers"
        :key="c.id"
        class="customer-row"
        @click="selectCustomer(c)"
      >
        <strong>{{ c.name }}</strong>
        <small>{{ c.address }}</small>
      </div>
    </div>

    <button class="btn info btn-block" @click="showNewCustomerForm = !showNewCustomerForm" style="margin-top: 12px; box-sizing: border-box;">
      {{ showNewCustomerForm ? '✕ Hide New Customer' : '+ Add New Customer' }}
    </button>

    <div v-if="showNewCustomerForm">
      <hr/>
      <h4>Add New Customer</h4>
      <div class="new-customer-form modal-form">
        <label>Name<input class="input" v-model="newCustomer.name" /></label>
        <label>Address<input class="input" v-model="newCustomer.address" /></label>
        <label>Phone<input class="input" v-model="newCustomer.phone" /></label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn checkout" @click="addCustomer">Save</button>
      <button class="btn danger" @click="showCustomerModal=false">Cancel</button>
    </div>
  </div>
</div>

<!-- REDEEM MODAL -->
<div v-if="showCustomerSection && loyaltyEnabled && showRedeemModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm">
    <h3>Redeem Points</h3>
    <p>Available: <strong>{{ customerPoints }}</strong></p>

    <p>
      Point value: <strong>{{ formatCurrency(redeemMultiplier) }}</strong> each
    </p>

    <p>
      Discount: <strong>{{ formatCurrency(redeemMultiplier * customerPoints) }}</strong>
    </p>

    <div class="modal-actions">
      <button class="btn checkout" @click="confirmPoints">Apply</button>
      <button class="btn danger" @click="showRedeemModal=false">Cancel</button>
    </div>
  </div>
</div>

<!-- SPECIAL DISCOUNT MODAL -->
<div v-if="showSpecialDiscountModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm special-discount-modal">
    <h3>Special Discount</h3>
    
    <div v-if="pointsUsed > 0" class="special-discount-note special-discount-note-points">
      <small>Redeemed Points Discount: <strong>{{ formatCurrency(redeemedPointsDiscount) }}</strong></small>
    </div>

    <label class="special-discount-label">Additional Discount Amount:</label>
    <input 
      type="number" 
      v-model.number="specialDiscountDraft" 
      placeholder="Enter discount amount"
      min="0"
      step="0.01"
      class="special-discount-input"
    />

    <label class="special-discount-label">Discount Note:</label>
    <textarea
      v-model="specialDiscountNoteDraft"
      rows="3"
      placeholder="Optional note for this special discount"
      class="special-discount-input special-discount-textarea"
    />

    <div v-if="specialDiscountDraft > 0" class="special-discount-note special-discount-note-summary">
      <div class="special-discount-row">
        <span>Points Discount:</span>
        <strong>{{ formatCurrency(redeemedPointsDiscount) }}</strong>
      </div>
      <div class="special-discount-row">
        <span>Special Discount:</span>
        <strong>{{ formatCurrency(specialDiscountDraft) }}</strong>
      </div>
      <hr class="special-discount-divider" />
      <div class="special-discount-row special-discount-total-row">
        <span><strong>Total Discount:</strong></span>
        <strong class="special-discount-total-value">{{ formatCurrency(redeemedPointsDiscount + specialDiscountDraft) }}</strong>
      </div>
    </div>

    <div class="modal-actions special-discount-actions">
      <button class="btn checkout" @click="applySpecialDiscount">Apply</button>
      <button 
        v-if="specialDiscount > 0 || specialDiscountDraft > 0" 
        class="btn danger" 
        @click="removeSpecialDiscount(); showSpecialDiscountModal = false"
      >Remove</button>
      <button class="btn secondary" @click="showSpecialDiscountModal=false">Cancel</button>
    </div>
  </div>
</div>
</div>
</template>

<style scoped>
/* Ensure Home view fills viewport and layouts use flex so no extra space remains */
.home-view {
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 12px 0; /* keep existing spacing from app */
  overflow-x: hidden;
}

.home-view h1 {
  margin-top: 0;
}


/* Make main content stretch to fill remaining space under the top controls */
.home-view > .pos-layout {
  flex: 1 1 auto;
  display: flex;
  gap: 14px;
  overflow: hidden;
  align-items: stretch; /* ensure children stretch to full available height */
  min-height: 0;
}

.home-view .catalog-panel {
  flex: 0 0 calc((100% - 14px) * 0.7);
  width: calc((100% - 14px) * 0.7);
  max-width: calc((100% - 14px) * 0.7);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home-view .pos-side-panel {
  flex: 0 0 calc((100% - 14px) * 0.3);
  width: calc((100% - 14px) * 0.3);
  max-width: calc((100% - 14px) * 0.3);
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home-view .cart-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Make table container scroll within available space */
.home-view .cart-table-container {
  flex: 1 1 auto;
  min-height: 0; /* allow proper flexbox scrolling */
  overflow-y: auto;
}

/* Right panel should not stretch taller than the view */
.home-view .right-panel {
  max-height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-self: stretch;
}

.search-section {
  display: flex;
  width: 100%;
  min-width: 0;
  position: relative;
}

.sold-to {
  min-width: 0;
}

.customer-section {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  /* background: #f9f9f9; */
  border-radius: 8px;
  flex: 1;
  /* min-width: 300px; */
  justify-content: flex-end;
}

.customer-section label {
  font-size: 18px;
  white-space: nowrap;
  margin: 0;
  font-weight: 600;
}

.customer-display {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.customer-name {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.customer-name .separator {
  margin: 0 8px;
  color: #bbb;
}

.redeem-section {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
  flex-wrap: wrap;
}

  /* =========================
   SEARCH BAR
========================= */
.input.pos-search-input {
  width: 100%;
  display: block;
  min-height: 48px;
  border-radius: 14px;
  font-size: 15px;
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
}
.btn.select-customer {
  background: linear-gradient(180deg, #3fa4e8 0%, #2b88cc 100%);
  color: #fff;
  border: 1px solid rgba(37, 99, 235, 0.15);
  border-radius: 12px;
  height: 46px;
  padding: 0 16px;
  box-shadow: 0 10px 20px rgba(52, 152, 219, 0.18);
  white-space: nowrap;
}

/* Dropdown */
.dropdown {
  position: absolute;
  top: 46px;
  left: 0;
  width: 100%;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 100;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  border: 1px solid lightgrey;
}
.dropdown-item:hover {
  background: #f0f8ff;
}

.dropdown-empty {
  display: flex;
  align-items: center;
  min-height: 60px;
}

.dropdown-empty-copy {
  width: 100%;
  padding: 14px 12px;
  color: #64748b;
  font-size: 14px;
  text-align: left;
}

/* =========================
   MAIN LAYOUT
========================= */
.pos-layout {
  display: flex;
  gap: 14px;
  min-height: 500px;
}

/* =========================
   CART WRAPPER
========================= */
.cart-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

/* Scrollable table container with max 5 rows visible */
.cart-table-container {
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px;
  min-height: 0;
}

.cart-table-container table {
  min-width: 680px;
}

/* Optional scroll indicator styling */
.cart-table-container::-webkit-scrollbar {
  width: 8px;
}
.cart-table-container::-webkit-scrollbar-thumb {
  background-color: rgba(0,0,0,0.25);
  border-radius: 4px;
}
.cart-table-container::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.05);
  border-radius: 4px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdfe 100%);
}
thead th {
  background: linear-gradient(180deg, #f4fbf8 0%, #ebf7f1 100%);
  color: #166a5e;
  font-weight: 700;
  font-size: 13px;
  padding: 12px 10px;
  border-bottom: 1px solid #d0e7de;
  text-align: center;
}
tbody td {
  padding: 11px 10px;
  border-bottom: 1px solid #e7edf2;
  text-align: center;
  color: #24323f;
}
tbody tr:nth-child(even) td { background: #f7fafc; }
tbody tr:hover td { background: #eef8f4; }

/* Totals below table */
.cart-totals {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0px 12px;
  padding: 10px;
  border-top: 1px solid #ccc;
  background: #f9f9f9;
  font-size: 18px;
  text-align: center;
  margin-top: auto
}

.cart-totals div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cart-totals span {
  font-size: 13px;
  color: #555;
}

.cart-totals strong {
  font-size: 20px;
  font-weight: 700;
}

/* Emphasis */
.cart-totals .grand strong {
  color: #28a745; /* GREEN */
  font-size: 26px;
}

.cart-totals .change strong {
  color: #e74c3c; /* RED */
  font-size: 26px;
}


/* =========================
   RIGHT PANEL
========================= */
.right-panel {
  /* responsive width: prioritize a compact column on small screens, scale on larger */
  width: clamp(220px, 22vw, 420px);
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f9f9f9;
  border: 1px solid #ccc;
  border-radius: 10px;
  padding: 12px;
  /* allow the panel to fill vertical space but keep inputs and controls visible */
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.checkout-inputs {
  display: grid;
  gap: 10px;
}

.checkout-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checkout-field > span {
  font-size: 14px;
  font-weight: 600;
}

.right-panel label {
  display: flex;
  flex-direction: column;
  font-size: 14px;
  font-weight: 600;
}
.right-panel input {
  flex: 0 0 auto;
  width: 100%;
  min-height: 2.2rem;
  max-height: 3.2rem;
  height: 2.6rem;
  border-radius: 12px;
  border: 1px solid #c4d0db;
  padding: 0 12px;
  font-size: 1.1rem;
  background: linear-gradient(180deg, #fbfdfe 0%, #f3f7fa 100%);
  color: #222;
  box-sizing: border-box;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 6px 14px rgba(15, 23, 42, 0.05);
  transition: height 0.2s, font-size 0.2s, box-shadow 0.2s ease, border-color 0.2s ease;
}

.right-panel input:focus {
  outline: 2px solid #3498db;
}

/* Emphasize inputs when active (clicked via numpad) to improve tap target on Android */
.right-panel input {
  transition: all 160ms ease-in-out;
}
.right-panel input.active-input,
.right-panel input:active {
  border-color: #2b6cb0;
  box-shadow: 0 8px 18px rgba(43,108,176,0.12);
}

.mobile-checkout-header {
  display: none;
}

.mobile-cart-totals {
  display: none;
}

/* Smaller screens: ensure active input doesn't push layout too much but still prominent */
@media (max-width: 480px) {
  /* No height/font-size adjustment for .active-input */
}

/* =========================
   NUMBER PAD
========================= */
.number-pad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: stretch;
  justify-items: stretch;
  width: 100%;
  /* number-pad takes available space after inputs; it should grow but stay scrollable if necessary */
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  /* grid-auto-rows: minmax(48px, 1fr); */
}

.number-pad .num-btn {
  width: 100%;
  min-width: 0;
  min-height: 56px;
}
/* Larger, full-screen friendly number pad for wide/tall screens */
@media (min-width: 900px) and (min-height: 700px) {
  .home-view .right-panel {
    width: 100%;
  }
}

/* On very large tablets or desktop-like screens, make pad visually larger and easier to tap */
@media (min-width: 1200px) {
  .home-view .right-panel {
    width: 100%;
  }
}
/* Very tall screens: increase right-panel and scale number pad rows to fill height */
@media (min-height: 1400px) {
  .home-view .right-panel {
    width: 420px;
  }
  .home-view .number-pad {
    grid-auto-rows: minmax(64px, 1fr);
  }
}
.btn.checkout {
  margin-top: 6px;
  min-height: 2.8rem;
  max-height: none;
  height: auto;
  font-size: 1.05rem;
  padding: 10px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
  transition: height 0.2s, font-size 0.2s;
}

/* =========================
   QTY CONTROLS
========================= */
.qty-wrapper {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
}
.qty-wrapper input {
  width: 50px;
  height: 36px;
  text-align: center;
  border-radius: 10px;
  border: 1px solid #c4d0db;
  background: linear-gradient(180deg, #fbfdfe 0%, #f3f7fa 100%);
  color: #0f172a;
  -webkit-text-fill-color: #0f172a;
  opacity: 1;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 4px 10px rgba(15, 23, 42, 0.05);
  transition: all 160ms ease-in-out;
}
.qty-wrapper input::-webkit-outer-spin-button,
.qty-wrapper input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.qty-wrapper input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
}
.qty-wrapper input.active-input {
  border: 2px solid #2b6cb0;
  box-shadow: 0 4px 12px rgba(43,108,176,0.15);
}
/* =========================
   PRICE BUTTONS
========================= */
.price-cell {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.price-cell .mini {
  padding: 4px 8px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  font-weight: 600;
  color: #fff;
  min-width: 70px;
}
.price-cell .mini.regular { background:#3498db; }
.price-cell .mini.discounted { background:#2980b9; }
.price-cell .mini.activePrice {
  background: #28a745;
  border: 2px solid #000;
}

/* =========================
   SELECTED CUSTOMER BADGE
========================= */
.selected-customer {
  padding: 6px 10px;
  border-radius: 8px;
  background: #e6f7ff;
  border: 1px solid #3498db;
  font-size: 16px;
  margin-top: 6px;
}

/* =========================
   CUSTOMER MODAL
========================= */
.modal {
  width: 380px;
}
.customer-list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid #d7e1ea;
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.8);
}
.customer-row {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #e7edf2;
}
.customer-row:hover { background: #eef8f4; }

/* =========================
  ITEM LABELS
========================= */
.catalog-name { font-size: 20px; text-align: left;}
.cart-item-name { font-weight:700; }
.catalog-meta {
  display: block;
  width: 100%;
  max-width: 100%;
  font-size: 16px;
  color: #64748b;
  text-align: left;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
}

/* =========================
   CUSTOMER MODAL FIX
========================= */

/* Force consistent layout */
.modal h3, .modal h4 {
  margin: 0;
  text-align: center;
}

/* Customer search field */
.modal .pos-search-input {
  width: 100%;
  height: 46px;
  font-size: 15px;
  padding: 0 14px;
  border-radius: 12px;
  box-sizing: border-box;
}

/* Modal buttons aligned */
.modal-actions .btn {
  flex: 1;
  height: 46px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-actions .btn.checkout,
.modal-actions .btn.danger {
  width: 100%;
}

.special-discount-actions {
  flex-direction: column;
  align-items: stretch;
}

.special-discount-actions .btn {
  width: 100%;
  min-width: 0;
}

.special-discount-modal {
  color: #0f172a;
  text-align: left;
}

.special-discount-modal h3 {
  text-align: center;
  color: #0f172a;
}

.special-discount-label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #334155;
}

.special-discount-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 16px rgba(15, 23, 42, 0.05);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.special-discount-input::placeholder {
  color: #94a3b8;
}

.special-discount-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18), 0 10px 20px rgba(37, 99, 235, 0.08);
}

.special-discount-textarea {
  min-height: 90px;
  resize: vertical;
  line-height: 1.5;
  padding: 12px 14px;
}

.special-discount-note {
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
}

.special-discount-note-points {
  background: #eef7ff;
  color: #1e3a5f;
  border: 1px solid #c8def4;
}

.special-discount-note-summary {
  background: #fff8df;
  color: #5f4b12;
  border: 1px solid #f0ddb0;
}

.special-discount-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.special-discount-divider {
  margin: 8px 0;
  border: none;
  border-top: 1px solid #ddd;
}

.special-discount-total-row {
  margin-bottom: 0;
  font-size: 18px;
}

.special-discount-total-value {
  color: #e74c3c;
}

/* Customer rows cleaner */
.customer-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Prevent flex shrink in modal */
.app-modal-panel > * {
  flex-shrink: 0;
}

.modal-customer {
  display: block;
}

.price-toggle {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.price-option-select {
  width: 100%;
  min-width: 0;
}

.num-btn,
.payment-option-btn,
.price-option-btn,
.qty-step-btn,
.discount-add-btn,
.remove-cart-item-btn {
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.1);
}

.qty-step-btn-decrement {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}

.qty-step-btn-decrement:hover,
.qty-step-btn-decrement:focus-visible {
  background: #b91c1c;
  border-color: #b91c1c;
}

.qty-add-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.qty-stock-alert {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e74c3c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 6px 12px rgba(231, 76, 60, 0.28);
}

.payment-toggle {
  display: flex;
  gap: 12px; /* visible separator between buttons */
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  flex-wrap: wrap;
}

.payment-toggle .payment-option-btn {
  flex: 1 1 160px;
  min-width: 0;
  min-height: 34px;
  padding: 4px 12px;
  font-size: 0.95rem;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Make number pad buttons and payment buttons adapt on narrow screens */
@media (max-width: 1023px) {
  .home-view {
    padding: 10px 8px;
  }

  .home-view > .pos-layout,
  .pos-layout {
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: visible;
  }

  .home-view .catalog-panel,
  .home-view .pos-side-panel {
    flex: 1 1 auto;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .home-view .cart-wrapper,
  .home-view .right-panel {
    min-height: 0;
  }

  .home-view .right-panel {
    width: 100%;
    min-width: 0;
    max-height: none;
    overflow: visible;
  }

  .customer-section {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .customer-display {
    flex: 1 1 100%;
  }

  .redeem-section {
    margin-left: 0;
    width: 100%;
  }

  .cart-totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .number-pad {
    grid-auto-rows: minmax(56px, auto);
    flex: none;
  }
}

@media (max-width: 900px) {
  .number-pad { gap: 8px; }
  .right-panel input { min-height: 2rem; max-height: 2.7rem; height: 2.2rem; font-size: 1rem; }
  .btn.checkout { min-height: 1.8rem; max-height: 2.4rem; height: 2rem; font-size: 0.95rem; }
  .catalog-meta { font-size: 14px; }
}

@media (max-width: 480px) {
  .number-pad { gap: 6px; }
  .payment-toggle { gap: 4px; }
  .right-panel input { min-height: 1.6rem; max-height: 2.2rem; height: 1.8rem; font-size: 0.95rem; }
  .btn.checkout { min-height: 1.5rem; max-height: 2rem; height: 1.7rem; font-size: 0.9rem; }
}

/* Narrow desktop/tablet stack before switching to full desktop layout */
@media (min-width: 1024px) and (max-width: 1199px) {
  .home-view .pos-side-panel {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .home-view .right-panel {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 12px;
    align-self: stretch;
  }

  .right-panel input {
    height: clamp(38px, 3.8vw, 48px)  !important;
    font-size: clamp(14px, 1.8vw, 18px);
  }

  /* Make numpad rows a bit tighter and ensure it fits without scrolling */
  .number-pad {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: auto;
    gap: 10px;
    max-height: none;
    overflow: visible;
    width: 100%;
  }

  .number-pad .num-btn {
    min-height: 0;
    aspect-ratio: 1 / 0.92;
    font-size: clamp(1rem, 2vw, 1.15rem);
  }

  .payment-toggle {
    gap: 8px;
  }

  .payment-toggle .payment-option-btn {
    flex: 1 1 120px;
    min-height: 32px;
    padding: 4px 10px;
    font-size: 0.88rem;
  }

  .btn.checkout {
    height: clamp(36px, 3.6vw, 44px)  !important;
    font-size: clamp(14px, 1.8vw, 16px);
  }
}

/* Large screen: increase prominence of payment buttons and inputs */
@media (min-width: 1200px) {
  .right-panel { width: 420px; }
  .right-panel input { min-height: 2.6rem; max-height: 3.6rem; height: 3rem; font-size: 1.2rem; }
  .btn.checkout { min-height: 2.2rem; max-height: 3rem; height: 2.6rem; font-size: 1.15rem; }
}

  /* Keep desktop landscape devices compact without overriding stacked tablet width */
  @media (min-width: 1025px) and (orientation: landscape) and (min-resolution: 2dppx) {
    .right-panel {
      width: clamp(300px, 22vw, 520px);
    }

    .right-panel input {
      height: clamp(55px, 6.5vh, 100px) !important;
      font-size: clamp(18px, 2.8vh, 28px) !important;
      padding: 8px 12px !important;
    }

  }

@media (min-width: 1024px) and (max-height: 820px) {
  .home-view > .pos-layout {
    overflow: auto;
  }

  .home-view .right-panel {
    gap: 8px;
  }

  .number-pad {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: auto;
    gap: 8px;
    width: 100%;
    overflow: visible;
  }

  .number-pad .num-btn {
    min-height: 0;
    aspect-ratio: 1 / 0.9;
    font-size: clamp(0.95rem, 1.6vw, 1.05rem);
  }

  .payment-toggle {
    gap: 6px;
  }

  .payment-toggle .payment-option-btn {
    flex: 1 1 110px;
    min-height: 28px;
    padding: 3px 8px;
    font-size: 0.82rem;
  }

  .right-panel input {
    min-height: 2.1rem;
    height: 2.3rem;
    font-size: 1rem;
  }

  .btn.checkout {
    min-height: 2.2rem;
    height: 2.3rem;
  }
}

.dropdown-item-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.stock-indicator {
  display: grid;
  gap: 4px;
  min-width: 152px;
  max-width: 210px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.25;
  text-align: right;
  border: 1px solid transparent;
}

.stock-indicator-text {
  font-weight: 700;
}

.stock-indicator-detail {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.95;
}

/* Colors for different stock levels */
.stock-indicator.out-of-stock {
  color: #7f1d1d;
  background: #fef2f2;
  border-color: #fecaca;
}

.stock-indicator.low-stock {
  color: #9a3412;
  background: #fff7ed;
  border-color: #fdba74;
}

.stock-indicator.normal-stock {
  color: #166534;
  background: #f0fdf4;
  border-color: #86efac;
}

/* SweetAlert modal tweaks for small screens/tablets */
.swal-wide {
  /* wider popup but constrained to a sensible max width */
  width: 96% !important;
  max-width: 1100px !important;
  max-height: calc(100vh - 32px) !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
  margin: 12px !important;
}
.swal-wide .swal2-title {
  position: sticky !important;
  top: 0 !important;
  background: #fff !important;
  z-index: 3 !important;
  padding-top: 8px !important;
}
.swal-wide .swal2-content {
  /* allow horizontal scrolling for wide tables/content inside the popup */
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
}
.swal-wide table {
  width: 100%;
  border-collapse: collapse;
  /* Ensure table can grow horizontally if needed and be scrolled */
  min-width: 640px;
}

/* Responsive improvements for tablets and phones */
@media (max-width: 900px) {
  .home-view {
    padding: 8px 6px;
  }

  .search-section {
    width: 100%;
    min-width: 0;
  }

  .input.pos-search-input {
    width: 100%;
    box-sizing: border-box;
  }

  .dropdown {
    width: 100%;
    left: 0;
    right: 0;
  }

  .dropdown-item-content {
    flex-direction: column;
  }

  .stock-indicator {
    min-width: 0;
    width: 100%;
    max-width: none;
    text-align: left;
  }

  .customer-section {
    flex: none;
    width: 100%;
    justify-content: space-between;
    padding: 8px;
  }

  .catalog-panel { order: 1; }
  .pos-side-panel { order: 2; }

  .cart-wrapper { width: 100%; }

  /* Right panel becomes horizontally flexible and wraps its controls */
  .right-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  .right-panel label { width: 100%; }

  .number-pad {
    grid-auto-rows: 56px;
    flex: none;
  }

  .cart-totals {
    grid-template-columns: 1fr;
    text-align: left;
    gap: 6px 0;
  }

  .cart-totals div { flex-direction: row; justify-content: space-between; align-items: center; }
}

@media (max-width: 1023px) {
  .sold-to {
    width: 100%;
  }

  .customer-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
    align-items: stretch;
    gap: 10px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    padding: 12px;
    border: 1px solid #dbe4ec;
    border-radius: 18px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
  }

  .customer-section label {
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .customer-display {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .customer-display > .btn.select-customer {
    grid-column: 1 / -1;
  }

  .customer-name {
    min-width: 0;
    padding: 12px 14px;
    border-radius: 14px;
    background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
    border: 1px solid #cfe0ff;
    font-size: 1rem;
    color: #0f172a;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .btn.select-customer {
    width: 100%;
    min-height: 48px;
    justify-content: center;
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .customer-display > .mini.danger {
    margin-left: 0 !important;
    width: 44px;
    min-width: 44px;
    height: 44px;
    border-radius: 14px;
    justify-self: end;
  }

  .redeem-section {
    width: 100%;
    max-width: 100%;
    margin-left: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    min-width: 0;
    box-sizing: border-box;
  }

  .redeem-section .mini {
    width: 100%;
    min-height: 44px;
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .redeem-section .mini + .mini {
    margin-top: 0;
  }

  .right-panel-mobile {
    gap: 12px;
    border-radius: 18px;
    background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
  }

  .mobile-checkout-header {
    display: grid;
    gap: 6px;
    padding: 2px 2px 0;
  }

  .mobile-checkout-kicker {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #2563eb;
  }

  .mobile-checkout-header h2 {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.2;
    color: #0f172a;
  }

  .mobile-checkout-help {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: #64748b;
  }

  .dropdown {
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    width: 100%;
    max-width: 100%;
    max-height: min(52vh, 420px);
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
    border: 1px solid #dbe4ec;
    border-radius: 18px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
    padding: 8px;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    box-sizing: border-box;
    border: none;
    border-radius: 14px;
    padding: 12px;
    margin-bottom: 8px;
    background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.05);
  }

  .dropdown-item:last-child {
    margin-bottom: 0;
  }

  .dropdown-item:hover {
    background: linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%);
  }

  .dropdown-item-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .dropdown-item-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .catalog-name {
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .catalog-meta {
    font-size: 13px;
    color: #64748b;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .dropdown-item-action {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #2563eb;
  }

  .stock-indicator {
    min-width: 0;
    width: 100%;
    max-width: none;
    text-align: left;
    padding: 10px 12px;
    box-sizing: border-box;
  }

  .stock-indicator-text,
  .stock-indicator-detail {
    overflow-wrap: anywhere;
  }

  .cart-wrapper {
    border-radius: 18px;
    border-color: #dbe4ec;
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08);
  }

  .checkout-inputs-mobile {
    grid-template-columns: 1fr;
    gap: 10px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .checkout-field-mobile {
    padding: 10px;
    border: 1px solid #d7e1ea;
    border-radius: 14px;
    background: #fff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 16px rgba(15, 23, 42, 0.05);
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
  }

  .checkout-field-mobile > span {
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
  }

  .checkout-field-mobile input {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .mobile-cart-totals {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mobile-cart-totals div {
    padding: 10px;
    border-radius: 14px;
    background: linear-gradient(180deg, #eef6ff 0%, #ffffff 100%);
    border: 1px solid #cfe0ff;
  }

  .mobile-cart-totals span {
    display: block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #2563eb;
    margin-bottom: 4px;
  }

  .mobile-cart-totals strong {
    font-size: 1.14rem;
    font-weight: 800;
    color: #0f172a;
  }

  .mobile-cart-totals div:nth-child(3) {
    background: linear-gradient(180deg, #fef2f2 0%, #fff7f7 100%);
    border-color: #fecaca;
  }

  .mobile-cart-totals div:nth-child(3) span {
    color: #b91c1c;
  }

  .mobile-cart-totals div:nth-child(3) strong {
    color: #dc2626;
  }

  .mobile-cart-total-emphasis {
    background: linear-gradient(180deg, #dcfce7 0%, #f7fff9 100%) !important;
    border-color: #86efac !important;
  }

  .mobile-cart-total-emphasis span {
    color: #15803d;
  }

  .mobile-cart-total-emphasis strong {
    font-size: 1.34rem;
    color: #166534;
  }

  .payment-toggle-mobile {
    display: flex;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: space-between;
    gap: 8px;
  }

  .payment-option-btn-mobile {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    height: auto;
    border-radius: 999px;
    font-size: 0.82rem;
    line-height: 1.1;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .right-panel-mobile .btn.checkout {
    max-height: 3rem;
    height: 2.5rem;
  }

  .cart-table-container {
    padding: 6px;
    overflow: visible;
  }

  .cart-table-container table,
  .cart-table-container thead,
  .cart-table-container tbody,
  .cart-table-container tr,
  .cart-table-container td {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  .cart-table-container table {
    min-width: 0;
    background: transparent;
  }

  .cart-table-container thead {
    display: none;
  }

  .cart-table-container tbody {
    display: grid;
    gap: 12px;
  }

  .cart-table-container tr {
    padding: 0;
    border: 1px solid #dbe4ec;
    border-radius: 18px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
    box-shadow: 0 12px 22px rgba(15, 23, 42, 0.07);
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
  }

  .cart-table-container tbody tr:nth-child(even) td,
  .cart-table-container tbody tr:hover td {
    background: transparent;
  }

  .cart-table-container td {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    padding: 12px;
    text-align: left;
    border-bottom: none;
    min-width: 0;
    overflow: hidden;
  }

  .cart-table-container td:last-child {
    padding-bottom: 12px;
  }

  .cart-table-container td::before {
    content: attr(data-label);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 2px;
  }

  .cart-table-container td[data-label="Item"] {
    background: linear-gradient(180deg, rgba(239, 246, 255, 0.92) 0%, rgba(248, 251, 253, 0.96) 100%);
  }

  .cart-table-container td[data-label="Price"],
  .cart-table-container td[data-label="Qty"],
  .cart-table-container td[data-label="Total"] {
    background: rgba(255, 255, 255, 0.88);
  }

  .cart-item-name {
    font-size: 1.24rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .cart-table-container td[data-label="Total"] {
    font-weight: 700;
    color: #166534;
    font-size: 1.22rem;
  }

  .cart-table-container td[data-label="Price"]::before,
  .cart-table-container td[data-label="Total"]::before {
    color: #334155;
  }

  .cart-table-container td[data-label="Price"] .price-option-select {
    font-size: 1.08rem;
    font-weight: 700;
  }

  .cart-table-container td[data-label="Price"] .price-option-select option {
    font-size: 1rem;
  }

  .cart-table-container td[data-label="Price"] .price-toggle {
    display: block;
    min-width: 0;
  }

  .cart-table-container td[data-label="Qty"] .qty-wrapper {
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .cart-table-container td[data-label="Qty"] .catalog-meta {
    margin-top: 2px;
    align-items: stretch;
  }

  .cart-table-container .price-option-btn,
  .cart-table-container .price-option-select {
    border-radius: 14px;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    white-space: normal;
    text-align: left;
    box-sizing: border-box;
  }

  .cart-table-container .price-option-select {
    min-height: 46px;
    padding: 10px 14px;
    border: 1px solid #cbd5e1;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.92), 0 8px 16px rgba(15, 23, 42, 0.06);
    font-size: 1.12rem;
    font-weight: 700;
  }

  .cart-table-container td:first-child {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .cart-table-container td:first-child::before {
    flex: none;
  }

  .cart-actions-cell {
    justify-content: flex-start !important;
    align-items: flex-end !important;
    background: transparent !important;
    padding-bottom: 12px !important;
  }

  .cart-actions-cell::before {
    display: none;
  }

  .price-toggle,
  .qty-wrapper {
    width: 100%;
    justify-content: flex-start;
  }

  .cart-table-container .qty-wrapper {
    align-items: center;
  }

  .cart-table-container .qty-step-btn {
    width: 46px;
    min-width: 46px;
    height: 46px;
    border-radius: 14px;
    border: 1px solid #bfdbfe;
    background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
    color: #1d4ed8;
    font-size: 1.2rem;
    font-weight: 800;
    box-shadow: 0 10px 18px rgba(37, 99, 235, 0.16);
  }

  .cart-table-container .qty-step-btn-decrement {
    border-color: #fecaca;
    background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%);
    color: #b91c1c;
    box-shadow: 0 10px 18px rgba(220, 38, 38, 0.14);
  }

  .price-option-select,
  .price-option-btn {
    width: 100%;
    max-width: 100%;
  }

  .qty-wrapper input {
    width: 64px;
    min-width: 64px;
    height: 46px;
    border-radius: 14px;
    font-size: 1rem;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 8px 16px rgba(15, 23, 42, 0.06);
  }

  .remove-cart-item-btn {
    min-width: 100%;
    min-height: 46px;
    border-radius: 14px;
    border: 1px solid #fecaca;
    background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%);
    color: #b91c1c;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    box-shadow: 0 10px 18px rgba(220, 38, 38, 0.14);
    font-size: 0;
    line-height: 0;
    position: relative;
  }

  .remove-cart-item-btn::before {
    content: 'Remove Item';
    display: inline-block;
    margin-left: 0;
    font-size: 0.98rem;
    line-height: 1.2;
    font-weight: 800;
    color: #991b1b;
  }

  .cart-table-container .catalog-meta {
    text-align: left;
    overflow-wrap: anywhere;
  }

  body.dark-mode .right-panel-mobile {
    background: linear-gradient(180deg, #2f3a45 0%, #25303a 100%);
    border-color: #4d5d6d;
    box-shadow: 0 20px 34px rgba(0, 0, 0, 0.28);
  }

  body.dark-mode .customer-section {
    background: linear-gradient(180deg, #34404b 0%, #2c3741 100%);
    border-color: #526272;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
  }

  body.dark-mode .customer-section label {
    color: #b8c5d3;
  }

  body.dark-mode .customer-name {
    background: linear-gradient(180deg, #2b475e 0%, #34404b 100%);
    border-color: #5b6f82;
    color: #f8fafc;
  }

  body.dark-mode .mobile-checkout-kicker {
    color: #7dd3fc;
  }

  body.dark-mode .mobile-checkout-header h2 {
    color: #f8fafc;
  }

  body.dark-mode .mobile-checkout-help,
  body.dark-mode .checkout-field-mobile > span,
  body.dark-mode .cart-table-container td::before,
  body.dark-mode .catalog-meta,
  body.dark-mode .dropdown-empty-copy {
    color: #b8c5d3;
  }

  body.dark-mode .dropdown-item-action {
    color: #7dd3fc;
  }

  body.dark-mode .checkout-field-mobile,
  body.dark-mode .dropdown,
  body.dark-mode .cart-wrapper,
  body.dark-mode .cart-table-container tr {
    background: linear-gradient(180deg, #34404b 0%, #2c3741 100%);
    border-color: #526272;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.22);
  }

  body.dark-mode .dropdown-item {
    background: linear-gradient(180deg, #3a4652 0%, #313c46 100%);
  }

  body.dark-mode .dropdown-item:hover {
    background: linear-gradient(180deg, #455362 0%, #36424e 100%);
  }

  body.dark-mode .catalog-name,
  body.dark-mode .cart-item-name,
  body.dark-mode .mobile-cart-totals strong {
    color: #f8fafc;
  }

  body.dark-mode .cart-table-container td[data-label="Item"] {
    background: linear-gradient(180deg, rgba(43, 71, 94, 0.9) 0%, rgba(52, 64, 75, 0.96) 100%);
  }

  body.dark-mode .cart-table-container td[data-label="Price"],
  body.dark-mode .cart-table-container td[data-label="Qty"],
  body.dark-mode .cart-table-container td[data-label="Total"] {
    background: rgba(44, 55, 65, 0.92);
  }

  body.dark-mode .cart-table-container td[data-label="Price"]::before,
  body.dark-mode .cart-table-container td[data-label="Total"]::before {
    color: #dbe4ec;
  }

  body.dark-mode .cart-table-container .price-option-select {
    border-color: #5b6f82;
    background: linear-gradient(180deg, #3b4652 0%, #34404b 100%);
    color: #f8fafc;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 10px 18px rgba(0, 0, 0, 0.18);
  }

  body.dark-mode .cart-table-container .qty-step-btn {
    border-color: #3b82f6;
    background: linear-gradient(180deg, #1e3a5f 0%, #1d4a78 100%);
    color: #dbeafe;
    box-shadow: 0 10px 18px rgba(30, 64, 175, 0.24);
  }

  body.dark-mode .cart-table-container .qty-step-btn-decrement {
    border-color: #b91c1c;
    background: linear-gradient(180deg, #5f1f1f 0%, #7f1d1d 100%);
    color: #fee2e2;
    box-shadow: 0 10px 18px rgba(127, 29, 29, 0.24);
  }

  body.dark-mode .cart-table-container .qty-wrapper input {
    background: linear-gradient(180deg, #3b4652 0%, #34404b 100%);
    border-color: #5c6b7c;
    color: #f8fafc;
    -webkit-text-fill-color: #f8fafc;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 10px 18px rgba(0, 0, 0, 0.18);
  }

  body.dark-mode .cart-table-container .remove-cart-item-btn {
    border-color: #ef4444;
    background: linear-gradient(180deg, #5f1f1f 0%, #7f1d1d 100%);
    box-shadow: 0 10px 18px rgba(127, 29, 29, 0.24);
  }

  body.dark-mode .cart-table-container .remove-cart-item-btn::before {
    color: #ffe4e6;
  }

  body.dark-mode .mobile-cart-totals div {
    background: linear-gradient(180deg, #263b4d 0%, #2f3a45 100%);
    border-color: #45617a;
  }

  body.dark-mode .mobile-cart-totals span {
    color: #93c5fd;
  }

  body.dark-mode .mobile-cart-totals div:nth-child(3) {
    background: linear-gradient(180deg, #5f1f1f 0%, #3f1c1c 100%);
    border-color: #b91c1c;
  }

  body.dark-mode .mobile-cart-totals div:nth-child(3) span {
    color: #fca5a5;
  }

  body.dark-mode .mobile-cart-totals div:nth-child(3) strong {
    color: #fecaca;
  }

  body.dark-mode .mobile-cart-total-emphasis {
    background: linear-gradient(180deg, #1d4531 0%, #1d3a2b 100%) !important;
    border-color: #2f855a !important;
  }

  body.dark-mode .mobile-cart-total-emphasis span,
  body.dark-mode .cart-table-container td[data-label="Total"] {
    color: #86efac;
  }

  body.dark-mode .mobile-cart-total-emphasis strong {
    color: #dcfce7;
  }

  body.dark-mode .stock-indicator.normal-stock {
    background: rgba(22, 101, 52, 0.24);
    border-color: rgba(134, 239, 172, 0.3);
    color: #bbf7d0;
  }

  body.dark-mode .stock-indicator.low-stock {
    background: rgba(154, 52, 18, 0.3);
    border-color: rgba(251, 191, 36, 0.32);
    color: #fde68a;
  }

  body.dark-mode .stock-indicator.out-of-stock {
    background: rgba(127, 29, 29, 0.34);
    border-color: rgba(248, 113, 113, 0.34);
    color: #fecaca;
  }
}

@media (max-width: 480px) {
  /* Tighten spacing on small phones */
  .home-view {
    min-height: 100vh;
    min-height: 100dvh;
    height: auto;
    padding: 6px 4px;
  }

  .home-view h1 {
    margin-top: 44px;
    margin-bottom: 8px;
    font-size: 1.5rem;
  }

  .input.pos-search-input { height: 40px; font-size: 14px; }
  .dropdown {
    top: 42px;
    max-height: 50vh;
  }
  .dropdown-item {
    padding: 10px;
  }
  .dropdown-item-content {
    gap: 8px;
  }
  .catalog-name {
    font-size: 17px;
  }
  .catalog-meta {
    font-size: 13px;
  }
  .stock-indicator {
    padding: 7px 8px;
    font-size: 12px;
  }
  .customer-section {
    gap: 8px;
    padding: 10px;
  }
  .customer-section label,
  .customer-name { font-size: 16px; }
  .btn.select-customer {
    width: 100%;
    justify-content: center;
  }
  .cart-totals {
    grid-template-columns: 1fr;
    text-align: left;
    gap: 8px 0;
    padding: 10px 8px;
  }
  .cart-totals div {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
  .right-panel input { height: 2.2rem; font-size: 1.05rem; }
  .right-panel {
    padding: 10px;
  }
  .qty-wrapper input { width: 44px; height: 34px; }
  .number-pad {
    display: none;
  }
  .payment-toggle {
    gap: 8px;
  }
  .payment-toggle-mobile .payment-option-btn-mobile {
    flex: 1 1 0;
    flex-basis: 0;
  }
  table th, table td { padding: 6px; }
  .cart-totals strong { font-size: 18px; }
  .modal {
    width: min(100%, 100vw - 24px);
  }
  .modal-actions {
    flex-direction: column;
  }
}

.cart-item-name {
  text-align: left !important;
}

</style>