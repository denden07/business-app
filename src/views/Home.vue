<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import Swal from 'sweetalert2'
import { dbPromise } from '../db'
import { reduceFromSource } from '../db/query'
import { Haptics } from '@capacitor/haptics'
import {
  defaultInteractionSettings,
  loadInteractionSettings,
} from '../utils/interactionPreferences'

const store = useStore()
const router = useRouter()
const route = useRoute()

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
const redeemMultiplier = ref(1)
const pointsConfirmed = ref(false)

// ======================
// SPECIAL DISCOUNT
// ======================
const showSpecialDiscountModal = ref(false)
const specialDiscount = ref(0)

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
        medicinesMap: JSON.parse(JSON.stringify(medicinesMap.value)),
        customer: selectedCustomer.value ? JSON.parse(JSON.stringify(selectedCustomer.value)) : null,
        professionalFee: professionalFee.value,
        moneyGiven: moneyGiven.value,
        pointsConfirmed: pointsConfirmed.value,
        redeemMultiplier: redeemMultiplier.value,
        customerPoints: customerPoints.value,
        specialDiscount: specialDiscount.value,
        paymentMethod: paymentMethod.value
      }
    })

    activeDraftId.value = savedDraftId ?? null

    cart.value = []
    professionalFee.value = 0
    moneyGiven.value = 0
    selectedCustomer.value = null
    pointsConfirmed.value = false
    redeemMultiplier.value = 1
    specialDiscount.value = 0
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
  cart.value = draft.cart
  Object.assign(medicinesMap.value, draft.medicinesMap || {})
  selectedCustomer.value = draft.customer || null
  professionalFee.value = draft.professionalFee || 0
  moneyGiven.value = draft.moneyGiven || 0
  pointsConfirmed.value = draft.pointsConfirmed || false
  redeemMultiplier.value = draft.redeemMultiplier || 1
  customerPoints.value = draft.customerPoints || 0
  specialDiscount.value = draft.specialDiscount || 0
  paymentMethod.value = draft.paymentMethod || 'cash'
  activeDraftId.value = draft.id
}

onMounted(async () => {
  await loadFeedbackSettings()
  const draftId = Number(route.query.draft)
  if (draftId) {
    const draft = await store.dispatch('drafts/getDraftById', draftId)
    if (draft) resumeDraft(draft)
  }

  window.addEventListener('interaction-settings-changed', handleInteractionSettingsChanged)
})

// ======================
// CUSTOMER MODAL
// ======================
const showNewCustomerForm = ref(false)

const pointsUsed = computed(() => pointsConfirmed.value ? customerPoints.value * redeemMultiplier.value : 0)
const pointsDiscount = computed(() => pointsUsed.value + specialDiscount.value)

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

const paymentMethod = ref('cash') // default
const interactionSettings = ref({ ...defaultInteractionSettings })
let numpadAudioContext = null

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
    gainNode.gain.exponentialRampToValueAtTime(0.028, startAt + 0.006)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start(startAt)
    oscillator.stop(endAt + 0.01)
  } catch {
    // Ignore platforms that block short synthesized UI sounds.
  }
}

const vibrateNumpad = async () => {
  if (!interactionSettings.value.vibrationEnabled) return

  try {
    await Haptics.selectionChanged()
    return
  } catch {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12)
    }
  }
}

const triggerNumpadFeedback = (frequency, duration) => {
  void playNumpadTone(frequency, duration)
  void vibrateNumpad()
}

// ======================
// NUMBER PAD
// ======================
const appendNumber = (num) => {
  triggerNumpadFeedback(760, 0.045)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) {
    focusedItem.value.qty = Number(String(focusedItem.value.qty) + num)
  } else if (focusedField.value === 'professionalFee') {
    professionalFee.value = Number(String(professionalFee.value) + num)
  } else if (focusedField.value === 'moneyGiven') {
    moneyGiven.value = Number(String(moneyGiven.value) + num)
  }
}

const backspace = () => {
  triggerNumpadFeedback(620, 0.05)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) {
    focusedItem.value.qty = Number(String(focusedItem.value.qty).slice(0, -1) || 0)
  } else if (focusedField.value === 'professionalFee') {
    professionalFee.value = Number(String(professionalFee.value).slice(0, -1) || 0)
  } else if (focusedField.value === 'moneyGiven') {
    moneyGiven.value = Number(String(moneyGiven.value).slice(0, -1) || 0)
  }
}

const clearInput = () => {
  triggerNumpadFeedback(480, 0.07)

  if (!focusedField.value) return

  if (focusedField.value === 'qty' && focusedItem.value) focusedItem.value.qty = 1
  else if (focusedField.value === 'professionalFee') professionalFee.value = 0
  else if (focusedField.value === 'moneyGiven') moneyGiven.value = 0
}

const incrementQty = (item) => {
  triggerNumpadFeedback(760, 0.045)
  item.qty += 1
}

const decrementQty = (item) => {
  triggerNumpadFeedback(620, 0.05)
  item.qty = Math.max(1, item.qty - 1)
}

const selectPaymentMethod = (method) => {
  triggerNumpadFeedback(700, 0.04)
  paymentMethod.value = method
}

const selectItemPriceType = (item, type) => {
  triggerNumpadFeedback(type === 'regular' ? 720 : 680, 0.04)
  setPriceType(item, type)
}

const SEARCH_RESULT_LIMIT = 20

// ======================
// MEDICINES SEARCH (WITH LATEST PRICE)
// ======================
// ======================
// MASTER MEDICINES CACHE
// ======================
const medicinesMap = ref({}) // id => medicine object
let filteredMedicines = ref ({})

watch(search, async (val) => {
  const q = val.trim().toLowerCase()
  if (!q) {
    filteredMedicines.value = []
    return
  }

  const db = await dbPromise
  const tx = db.transaction(['medicines', 'inventory_batches'], 'readonly')
  const medsStore = tx.objectStore('medicines')
  const batchIndex = tx.objectStore('inventory_batches').index('medicine_id')
  const matches = []

  let cursor = await medsStore.openCursor()
  while (cursor) {
    const medicine = cursor.value
    const name = (medicine.name || '').toLowerCase()
    const generic = (medicine.generic_name || '').toLowerCase()
    const matchesQuery = name.startsWith(q) || generic.startsWith(q)

    if (matchesQuery) {
      if (matches.length < SEARCH_RESULT_LIMIT) {
        matches.push({ ...medicine })
      }
    }

    cursor = await cursor.continue()
  }

  for (const m of matches) {
    const totalStock = await reduceFromSource(
      batchIndex,
      (sum, batch) => sum + Number(batch.quantity || 0),
      0,
      { query: m.id }
    )

    m.quantity = totalStock
    m.stockIndicator = getStockIndicator({ quantity: totalStock })
    medicinesMap.value[m.id] = m
  }

  // Sort exact prefix matches by brand first, then generic name.
  matches.sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aGeneric = (a.generic_name || '').toLowerCase()
    const bGeneric = (b.generic_name || '').toLowerCase()
    
    const aStartsWithName = aName.startsWith(q)
    const bStartsWithName = bName.startsWith(q)
    const aStartsWithGeneric = aGeneric.startsWith(q)
    const bStartsWithGeneric = bGeneric.startsWith(q)
    
    // Both start with search term or neither starts
    if ((aStartsWithName || aStartsWithGeneric) && (bStartsWithName || bStartsWithGeneric)) {
      return aName.localeCompare(bName)
    }
    if (!(aStartsWithName || aStartsWithGeneric) && !(bStartsWithName || bStartsWithGeneric)) {
      return aName.localeCompare(bName)
    }
    
    // One starts with search term, prioritize it
    return (aStartsWithName || aStartsWithGeneric) ? -1 : 1
  })

  filteredMedicines.value = matches
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
const addToCart = async (med) => {
  const price = selectedPriceType.value === 'regular'
    ? med.price1
    : med.price2

  const existing = cart.value.find(i => i.id === med.id && i.priceType === selectedPriceType.value)
  const currentStock = medicinesMap.value[med.id]?.quantity || 0
  const cartQty = existing ? existing.qty : 0
  const newQty = cartQty + 1

  // Warning if exceeding stock
  if (newQty > currentStock) {
    await Swal.fire({
      icon: 'warning',
      title: 'Low Stock Warning',
      html: `<b>${med.name}</b><br/>Available: ${currentStock}<br/>Cart Total: ${newQty}<br/><br/>You are exceeding available stock!`,
      confirmButtonText: 'Add Anyway',
      timer: 2000,
      timerProgressBar: true
    })
  }

  if (existing) existing.qty += 1
  else cart.value.push({
    id: med.id,
    name: med.name,
    generic_name: med.generic_name || '',
    priceType: selectedPriceType.value,
    price,
    qty: 1
  })

  search.value = ''
  filteredMedicines.value = []
}


const setPriceType = (item, type) => {
  const med = medicinesMap.value[item.id] // <-- always the original med
  if (!med) return
  item.priceType = type
  item.price = type === 'regular' ? med.price1 : med.price2
}


const removeItem = (id) => {
  cart.value = cart.value.filter(i => i.id !== id)
}


const getPrice = (medId, type) => {
  const med = filteredMedicines.value.find(m => m.id === medId) || cart.value.find(m => m.id === medId)
  if (!med) return '0.00'
  const price = type === 'regular' 
    ? Number(med.price1 || 0) 
    : Number(med.price2 || med.price1 || 0)
  return price.toFixed(2)
}


// ======================
// TOTALS
// ======================
const subTotal = computed(() => cart.value.reduce((sum, i) => sum + i.price * i.qty, 0))
const grandTotal = computed(() => Math.max(subTotal.value + Number(professionalFee.value || 0) - Number(pointsDiscount.value || 0), 0))
const change = computed(() => Math.max((moneyGiven.value || 0) - grandTotal.value, 0))

// ======================
// REDEEM FLOW
// ======================
const openRedeemModal = () => {
  if (!selectedCustomer.value) return Swal.fire('Select customer first')
  redeemMultiplier.value = 1
  showRedeemModal.value = true
}

const confirmPoints = () => {
  pointsConfirmed.value = true
  showRedeemModal.value = false
}

const removePoints = () => {
  pointsConfirmed.value = false
  redeemMultiplier.value = 1
}

// ======================
// SPECIAL DISCOUNT
// ======================
const openSpecialDiscountModal = () => {
  showSpecialDiscountModal.value = true
}

const applySpecialDiscount = () => {
  showSpecialDiscountModal.value = false
}

const removeSpecialDiscount = () => {
  specialDiscount.value = 0
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

  if ((moneyGiven.value || 0) < grandTotal.value) {
    const { isConfirmed } = await Swal.fire({
      icon: 'warning',
      title: 'Insufficient payment',
      text: 'No money given or amount is less than total. Save this sale as a draft instead?',
      showCancelButton: true,
      confirmButtonText: 'Save as Draft',
      cancelButtonText: 'Back to Cart'
    })
    if (isConfirmed) await saveSaleAsDraft()
    return
  }

  // Check stock and warn for all items exceeding available quantity
  const stockWarnings = []
  for (const item of cart.value) {
    const available = medicinesMap.value[item.id]?.quantity || 0
    if (item.qty > available) {
      const shortage = item.qty - available
      stockWarnings.push(`<b>${item.name}</b>: Need ${item.qty}, Available ${available} (Short by ${shortage})`)
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

  // Confirmation with detailed breakdown
  const itemsTable = `
    <div style="max-height: 40vh; overflow-y: auto; margin: 16px 0; border: 1px solid #ddd; border-radius: 4px;">
      <table style="width:100%; border-collapse: collapse; text-align: left;">
        <thead style="position: sticky; top: 0; background: #f5f5f5; z-index: 10;">
          <tr style="border-bottom: 2px solid #ddd;">
            <th style="padding: 8px;">Medicine</th>
            <th style="padding: 8px; text-align: center;">Qty</th>
            <th style="padding: 8px; text-align: right;">Price</th>
            <th style="padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${cart.value.map(item => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px;">${item.name}</td>
              <td style="padding: 8px; text-align: center;">${item.qty}</td>
              <td style="padding: 8px; text-align: right;">₱${item.price.toFixed(2)}</td>
              <td style="padding: 8px; text-align: right;">₱${(item.price * item.qty).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div style="margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px;">
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #2c5aa0;">
          <span>Sold to:</span>
          <span>${selectedCustomer.value ? selectedCustomer.value.name : 'Walk-in Customer'}</span>
        </div>
        ${selectedCustomer.value?.phone ? `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 13px; color: #4a6fa5;">
            <span>Phone:</span>
            <span>${selectedCustomer.value.phone}</span>
          </div>
        ` : ''}
      </div>

      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Subtotal:</span>
        <span>₱${subTotal.value.toFixed(2)}</span>
      </div>
      ${professionalFee.value > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span>Professional Fee:</span>
          <span>₱${professionalFee.value.toFixed(2)}</span>
        </div>
      ` : ''}
      ${pointsDiscount.value > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e53e3e;">
          <span>Discount:</span>
          <span>-₱${pointsDiscount.value.toFixed(2)}</span>
        </div>
        ${pointsUsed.value > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 13px; color: #718096;">
            <span>• Points:</span>
            <span>-₱${pointsUsed.value.toFixed(2)}</span>
          </div>
        ` : ''}
        ${specialDiscount.value > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 13px; color: #718096;">
            <span>• Special:</span>
            <span>-₱${specialDiscount.value.toFixed(2)}</span>
          </div>
        ` : ''}
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>Money Given:</span>
        <span>₱${moneyGiven.value.toFixed(2)}</span>
      </div>
      <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;" />
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 18px; font-weight: bold; color: #2d3748;">
        <span>Grand Total:</span>
        <span style="color: green;">₱${grandTotal.value.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 18px; font-weight: bold; color: #2d3748;">
        <span>Change:</span>
        <span style="color: red;">₱${change.value.toFixed(2)}</span>
      </div>
    </div>
  `
  
  const confirmResult = await Swal.fire({
    title: 'Confirm Checkout',
    html: itemsTable,
    icon: 'question',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Yes, Save Sale',
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
      pointsUsed: pointsUsed.value,
      pointsMultiplier: redeemMultiplier.value,
      pointsDiscount: pointsDiscount.value,
      payment_method: paymentMethod.value,
    })

    Swal.fire({
      icon: 'success',
      title: 'Sale Completed',
      text: `Sale #${saleId} saved`,
      timer: 1500,
      showConfirmButton: false
    })

    // Reset POS
    cart.value = []
    professionalFee.value = 0
    moneyGiven.value = 0
    selectedCustomer.value = null
    customerPoints.value = 0
    redeemMultiplier.value = 1
    pointsConfirmed.value = false
    specialDiscount.value = 0

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

  redeemMultiplier.value = 1
  pointsConfirmed.value = false
}


// ======================
// ADD CUSTOMER
// ======================
const addCustomer = async () => {
  if (!newCustomer.value.name) return

  const id = await store.dispatch('customers/addCustomer', newCustomer.value)
  selectedCustomer.value = { id, ...newCustomer.value }

  customerPoints.value = 0
  redeemMultiplier.value = 1
  pointsConfirmed.value = false

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
  if (!open) {
    redeemMultiplier.value = 1
    pointsConfirmed.value = false
  }
})

watch(showSpecialDiscountModal, (open) => {
  if (!open) {
    specialDiscount.value = 0
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('interaction-settings-changed', handleInteractionSettingsChanged)

  if (numpadAudioContext && numpadAudioContext.state !== 'closed') {
    numpadAudioContext.close().catch(() => {})
  }
  numpadAudioContext = null
})

const getStockIndicator = (med) => {
  if (!med.quantity || med.quantity <= 0) {
    return { icon: '▲!', color: 'red', text: 'Out of stock', quantity: 0 }
  } else if (med.quantity < 10) {
    return { icon: '▲', color: 'orange', text: `Low stock: ${med.quantity}`, quantity: med.quantity }
  } else {
    return { icon: '', color: 'green', text: `Stock: ${med.quantity}`, quantity: med.quantity }
  }
}


</script>

<template>
<div class="home-view">
 <h1>Calculator</h1>

  <!-- SEARCH BAR + CUSTOMER + REDEEM (ALL INLINE) -->
  <div class="top-controls">
  <div class="search-section">
    <SearchInput v-model="search" placeholder="Search medicine..." :inputClass="'input pos-medicine-search'" />
    
    <!-- Dropdown -->
    <div v-if="search && filteredMedicines.length" class="dropdown">
      <div v-for="med in filteredMedicines" :key="med.id" class="dropdown-item" @click="addToCart(med)">
        <div class="dropdown-item-content">
          <div>
            <div class="med-name">{{ med.name }}</div>
            <div class="med-generic" v-if="med.generic_name">{{ med.generic_name }}</div>
          </div>

          <div 
            class="stock-indicator" 
            :title="med.stockIndicator.text"
            :class="{
              'out-of-stock': med.quantity <= 0,
              'low-stock': med.quantity > 0 && med.quantity < 10,
              'normal-stock': med.quantity >= 10
            }"
          >
            <span>Remaining QTY: {{ med.quantity }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

      <div class="sold-to">
        <!-- CUSTOMER SECTION + REDEEM (inline together) -->
        <div class="customer-section">
          <label><strong>Sold to:</strong></label>
          <div class="customer-display">
            <span v-if="selectedCustomer" class="customer-name">
              👤 {{ selectedCustomer.name }} 
            </span>
            <button v-if="!selectedCustomer" class="btn select-customer" @click="showCustomerModal=true">
              Select Customer
            </button>
            <button style="margin-left: 8px" v-if="selectedCustomer" class="mini danger" @click="selectedCustomer=null">✕</button>
          </div>

          <!-- REDEEM BUTTONS (inline in same section) -->
          <div v-if="selectedCustomer" class="redeem-section">
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


</div>



<div class="pos-layout">
  <!-- CENTER: CART -->
  <div class="cart-wrapper">
    <div class="cart-table-container">
      <table v-if="cart.length">
        <thead>
          <tr>
            <th width="25%">Medicine</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in cart" :key="item.id">
            <td>
              <div class="med-name-table">{{ item.name }}</div>
              <!-- <div class="med-generic" v-if="item.generic_name">{{ item.generic_name }}</div> -->
            </td>
            <td>
<div class="price-toggle">
  <button
    class="price-option-btn"
    :class="{ active: item.priceType === 'regular', inactive: item.priceType !== 'regular' }"
    @click="selectItemPriceType(item, 'regular')"
  >
    Reg ₱{{ medicinesMap[item.id]?.price1.toFixed(2) || '0.00' }}
  </button>

  <button
    class="price-option-btn"
    v-if="medicinesMap[item.id]?.price2 && medicinesMap[item.id]?.price2 > 0"
    :class="{ active: item.priceType === 'discount', inactive: item.priceType !== 'discount' }"
    @click="selectItemPriceType(item, 'discount')"
  >
    Dis ₱{{ medicinesMap[item.id]?.price2.toFixed(2) || '0.00' }}
  </button>
</div>

            </td>
            <td>
              <div class="qty-wrapper">
                <button class="qty-step-btn" @click="decrementQty(item)">-</button>
                <input
                  style="font-weight: bold"
                  type="number"
                  :value="item.qty"
                  readonly
                  @click="setActiveInput(item,'qty')"
                  :style="getQtyInputStyle(item.qty)"
                  :class="{ 'active-input': focusedField==='qty' && focusedItem===item }"
                />
                <button class="qty-step-btn" @click="incrementQty(item)">+</button>
              </div>
            </td>
            <td>₱{{ (item.price * item.qty).toFixed(2) }}</td>
            <td>
              <button class="mini danger button-remove-med" @click="removeItem(item.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>No items</p>
    </div>

    <!-- Totals -->
    <div class="cart-totals">
      <div>
        <span>Subtotal</span>
        <strong>₱{{ subTotal.toFixed(2) }}</strong>
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
        <strong>-₱{{ pointsDiscount }}</strong>
      </div>

      <div class="grand">
        <span><strong>Grand Total</strong></span>
        <strong>₱{{ grandTotal.toFixed(2) }}</strong>
      </div>

      <div class="change">
        <span><strong>Change</strong></span>
        <strong>₱{{ change.toFixed(2) }}</strong>
      </div>
    </div>

  </div>

  <!-- RIGHT PANEL -->
  <div class="right-panel">
    <label>
      Professional Fee
      <input
        type="number"
        :value="professionalFee"
        readonly
        @click="setActiveInput(null,'professionalFee')"
        :class="{ 'active-input': focusedField==='professionalFee' }"
      />
    </label>

    <label>
      Money Given
      <input
        type="number"
        :value="moneyGiven"
        readonly
        @click="setActiveInput(null,'moneyGiven')"
        :class="{ 'active-input': focusedField==='moneyGiven' }"
      />
    </label>

    <!-- Number Pad (reordered: 7-9 top, 1-3 bottom) -->
    <div class="number-pad">
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

    <div class="payment-toggle">
      <button
        class="payment-option-btn"
        :class="{ active: paymentMethod === 'cash' }"
        @click="selectPaymentMethod('cash')"
      >
        Cash
      </button>

      <button
        class="payment-option-btn"
        :class="{ active: paymentMethod === 'gcash' }"
        @click="selectPaymentMethod('gcash')"
      >
        GCash
      </button>
    </div>


    <button class="btn checkout" @click="checkout">Save Sale</button>
  </div>
</div>

<!-- CUSTOMER MODAL -->
<div v-if="showCustomerModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm modal-customer">
    <h3>Select Customer</h3>

    <SearchInput v-model="customerSearch" placeholder="Search customer..." wrapperClass="full" :inputClass="'input pos-medicine-search'" />

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
<div v-if="showRedeemModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm">
    <h3>Redeem Points</h3>
    <p>Available: <strong>{{ customerPoints }}</strong></p>

    <div class="qty-wrapper">
      <button class="qty-step-btn" @click="redeemMultiplier = Math.max(1, redeemMultiplier - 1)">-</button>
      <input type="number" :value="redeemMultiplier" readonly />
      <button class="qty-step-btn" @click="redeemMultiplier += 1">+</button>
    </div>

    <p>
      Discount: <strong>₱{{ redeemMultiplier * customerPoints }}</strong>
    </p>

    <div class="modal-actions">
      <button class="btn checkout" @click="confirmPoints">Apply</button>
      <button class="btn danger" @click="showRedeemModal=false">Cancel</button>
    </div>
  </div>
</div>

<!-- SPECIAL DISCOUNT MODAL -->
<div v-if="showSpecialDiscountModal" class="modal-backdrop app-modal-backdrop">
  <div class="modal app-modal-panel modal-sm">
    <h3>Special Discount</h3>
    
    <div v-if="pointsUsed > 0" style="padding: 10px; background: #e6f7ff; border-radius: 6px; margin-bottom: 10px;">
      <small>Redeemed Points Discount: <strong>₱{{ pointsUsed }}</strong></small>
    </div>

    <label style="font-weight: 600; margin-bottom: 8px;">Additional Discount Amount:</label>
    <input 
      type="number" 
      v-model.number="specialDiscount" 
      placeholder="Enter discount amount"
      min="0"
      step="0.01"
      style="margin-bottom: 12px;"
    />

    <div v-if="specialDiscount > 0" style="padding: 10px; background: #fff3cd; border-radius: 6px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Points Discount:</span>
        <strong>₱{{ pointsUsed }}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Special Discount:</span>
        <strong>₱{{ specialDiscount }}</strong>
      </div>
      <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;" />
      <div style="display: flex; justify-content: space-between; font-size: 18px;">
        <span><strong>Total Discount:</strong></span>
        <strong style="color: #e74c3c;">₱{{ pointsUsed + specialDiscount }}</strong>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn checkout" @click="applySpecialDiscount">Apply</button>
      <button 
        v-if="specialDiscount > 0" 
        class="btn danger" 
        @click="removeSpecialDiscount(); showSpecialDiscountModal = false"
        style="flex: 0.8;"
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 12px 0; /* keep existing spacing from app */
}


/* Make main content stretch to fill remaining space under the top controls */
.home-view > .pos-layout {
  flex: 1 1 auto;
  display: flex;
  gap: 14px;
  overflow: hidden;
  align-items: stretch; /* ensure children stretch to full available height */
}

/* Keep top controls fixed height and not stretching */
.home-view > .top-controls {
  flex: 0 0 auto;
}

/* Ensure cart-wrapper stretches vertically inside pos-layout */
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
  /* flex: 0 0 220px; */
  max-height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

  /* =========================
   TOP CONTROLS (INLINE)
========================= */
.top-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
}

.search-section {
  display: flex;
  flex: 1;
  min-width: 250px;
  position: relative;
}

.customer-section {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  /* background: #f9f9f9; */
  border-radius: 8px;
  flex: 1;
  min-width: 300px;
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
}

  /* =========================
   SEARCH BAR
========================= */
.input.pos-medicine-search {
  width: 70%;
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
  width: 70%;
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
  overflow-y: auto;
  padding: 10px;
  min-height: 0;
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
tbody tr:last-child td { border-bottom: none; }

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
  /* number-pad takes available space after inputs; it should grow but stay scrollable if necessary */
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  /* grid-auto-rows: minmax(48px, 1fr); */
}
/* Larger, full-screen friendly number pad for wide/tall screens */
@media (min-width: 900px) and (min-height: 700px) {
  .home-view .right-panel {
    width: 320px;
  }
}

/* On very large tablets or desktop-like screens, make pad visually larger and easier to tap */
@media (min-width: 1200px) {
  .home-view .right-panel {
    width: 380px;
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
  min-height: 2.1rem;
  max-height: 2.8rem;
  height: 2.4rem;
  font-size: 1.05rem;
  padding: 8px 12px;
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
   MED NAMES
========================= */
.med-name { font-size: 20px; text-align: left;}
.med-name-table { font-weight:700; }
.med-generic { font-size:16px; color:#888; text-align: left; }

/* =========================
   CUSTOMER MODAL FIX
========================= */

/* Force consistent layout */
.modal h3, .modal h4 {
  margin: 0;
  text-align: center;
}

/* Customer search field */
.modal .pos-medicine-search {
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
  gap: 6px;
}

.num-btn,
.payment-option-btn,
.price-option-btn,
.qty-step-btn,
.discount-add-btn,
.button-remove-med {
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.1);
}

.payment-toggle {
  display: flex;
  gap: 12px; /* visible separator between buttons */
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
}

/* Make number pad buttons and payment buttons adapt on narrow screens */
@media (max-width: 900px) {
  .number-pad { gap: 8px; }
  .right-panel input { min-height: 2rem; max-height: 2.7rem; height: 2.2rem; font-size: 1rem; }
  .btn.checkout { min-height: 1.8rem; max-height: 2.4rem; height: 2rem; font-size: 0.95rem; }
}

@media (max-width: 480px) {
  .number-pad { gap: 6px; }
  .payment-toggle { gap: 4px; }
  .right-panel input { min-height: 1.6rem; max-height: 2.2rem; height: 1.8rem; font-size: 0.95rem; }
  .btn.checkout { min-height: 1.5rem; max-height: 2rem; height: 1.7rem; font-size: 0.9rem; }
}

/* Smaller tablets: avoid vertical overflow by reducing element heights and removing numpad scroll */
@media (min-width: 600px) and (max-width: 1024px) {
  .right-panel {
    width: clamp(260px, 28vw, 360px);
    padding: 10px;
  }

  .right-panel input {
    height: clamp(38px, 3.8vw, 48px)  !important;
    font-size: clamp(14px, 1.8vw, 18px);
  }

  /* Make numpad rows a bit tighter and ensure it fits without scrolling */
  .number-pad {
    grid-auto-rows: 44px;
    gap: 6px;
    max-height: calc(100% - 160px);
    overflow: visible;
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

  /* High-density landscape devices (e.g. Android 240dpi landscape):
     increase input prominence and reduce numpad scaling so inputs don't look small */
  @media (orientation: landscape) and (min-resolution: 2dppx) {
    .right-panel {
      width: clamp(300px, 22vw, 520px);
    }

    .right-panel input {
      height: clamp(55px, 6.5vh, 100px) !important;
      font-size: clamp(18px, 2.8vh, 28px) !important;
      padding: 8px 12px !important;
    }

  }

.dropdown-item-content {
  display: flex;
  justify-content: space-between;
  gap:8px;
}

.stock-indicator {
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 14px;
}

/* Colors for different stock levels */
.stock-indicator.out-of-stock {
  color: #fff;
  background-color: #e74c3c; /* red */
}

.stock-indicator.low-stock {
  color: #fff;
  background-color: #f39c12; /* orange */
}

.stock-indicator.normal-stock {
  color: #fff;
  background-color: #27ae60; /* green */
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

  /* Stack top controls vertically and make inputs full width */
  .top-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .search-section {
    flex: none;
    width: 100%;
    min-width: 0;
  }

  .input.pos-medicine-search {
    width: 100%;
    box-sizing: border-box;
  }

  .dropdown {
    width: 100%;
    left: 0;
    right: 0;
  }

  .customer-section {
    flex: none;
    width: 100%;
    justify-content: space-between;
    padding: 8px;
  }

  /* Make main layout stack: cart on top, controls below to be thumb-friendly */
  .pos-layout {
    flex-direction: column-reverse;
    gap: 10px;
    min-height: 0;
  }

  .cart-wrapper { order: 1; width: 100%; }
  .right-panel { order: 2; width: 100%; height: auto; max-height: none; overflow: visible; }

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

@media (max-width: 480px) {
  /* Tighten spacing on small phones */
  .input.pos-medicine-search { height: 40px; font-size: 14px; }
  .customer-name { font-size: 16px; }
  .right-panel input { height: 2.2rem; font-size: 1.05rem; }
  .qty-wrapper input { width: 44px; height: 34px; }
  .number-pad { grid-auto-rows: 48px; }
  table th, table td { padding: 6px; }
  .cart-totals strong { font-size: 18px; }
}

</style>