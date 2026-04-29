<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { dbPromise } from '../db'
import { reduceFromSource } from '../db/query'
import Swal from 'sweetalert2'

const props = defineProps({
  itemToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])
const store = useStore()
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const templateItemDefaults = computed(() => store.getters['template/itemDefaults'] || {
  itemType: 'product',
  trackExpiry: false,
})
const templateWorkflow = computed(() => activeTemplate.value.workflow || {})
const templateCapabilities = computed(() => activeTemplate.value.capabilities || {})

const name = ref('')
const description = ref('')
const itemType = ref('product')
const price1 = ref(0)
const price2 = ref(0)
const trackExpiry = ref(false)
const adjustmentQty = ref(0)
const expiryDate = ref('')
const totalStock = ref(0)

const allowProductItems = computed(() => {
  if (props.itemToEdit?.item_type === 'product') return true
  return templateWorkflow.value.allowProductSales !== false
})

const allowServiceItems = computed(() => {
  if (props.itemToEdit?.item_type === 'service') return true
  return templateWorkflow.value.allowServiceSales !== false
})

const itemTypeOptions = computed(() => {
  const options = []

  if (allowProductItems.value) {
    options.push({ value: 'product', label: 'Product' })
  }

  if (allowServiceItems.value) {
    options.push({ value: 'service', label: 'Service' })
  }

  return options
})

const itemTypeLocked = computed(() => itemTypeOptions.value.length <= 1)
const isProduct = computed(() => itemType.value === 'product')
const expiryTrackingRequired = computed(() => templateCapabilities.value.expiryTracking === 'required')
const expiryDisabledReason = computed(() => {
  if (!isProduct.value) return 'Expiry tracking is available only for product items.'
  if (expiryTrackingRequired.value) return 'The active template requires expiry tracking.'
  return ''
})

watch([allowProductItems, allowServiceItems], ([productsAllowed, servicesAllowed]) => {
  if (productsAllowed && servicesAllowed) {
    return
  }

  if (!productsAllowed && servicesAllowed) {
    itemType.value = 'service'
    return
  }

  if (productsAllowed && !servicesAllowed) {
    itemType.value = 'product'
  }
}, { immediate: true })

watch(isProduct, value => {
  if (!value) {
    trackExpiry.value = false
    adjustmentQty.value = 0
    expiryDate.value = ''
    totalStock.value = 0
    return
  }

  if (!props.itemToEdit) {
    trackExpiry.value = !!templateItemDefaults.value.trackExpiry
  }

  if (expiryTrackingRequired.value) {
    trackExpiry.value = true
  }
})

watch([isProduct, expiryTrackingRequired], ([productSelected, expiryRequired]) => {
  if (productSelected && expiryRequired) {
    trackExpiry.value = true
  }
}, { immediate: true })

const isValid = computed(() => name.value.trim() !== '' && Number(price1.value) > 0)

const loadTotalStock = async (itemId) => {
  if (!itemId) {
    totalStock.value = 0
    return
  }

  const db = await dbPromise
  const index = db.transaction('item_batches').objectStore('item_batches').index('item_id')

  totalStock.value = await reduceFromSource(
    index,
    (sum, batch) => sum + Number(batch.quantity || 0),
    0,
    { query: itemId }
  )
}

const loadItemData = async (item) => {
  const defaults = templateItemDefaults.value

  name.value = item?.name || ''
  description.value = item?.description || ''
  itemType.value = item?.item_type || defaults.itemType || itemTypeOptions.value[0]?.value || 'product'
  price1.value = Number(item?.price1 || 0)
  price2.value = Number(item?.price2 || 0)
  trackExpiry.value = item ? !!item.track_expiry : !!defaults.trackExpiry
  adjustmentQty.value = 0
  expiryDate.value = ''

  if (item?.id && item.item_type === 'product') {
    await loadTotalStock(item.id)
  } else {
    totalStock.value = 0
  }

  if (!item && itemType.value === 'product' && expiryTrackingRequired.value) {
    trackExpiry.value = true
  }
}

watch(() => props.itemToEdit, loadItemData, { immediate: true })
onMounted(() => loadItemData(props.itemToEdit))

const submitForm = async () => {
  if (!isValid.value) {
    await Swal.fire({
      icon: 'warning',
      title: 'Incomplete form',
      text: 'Please fill all required fields.'
    })
    return
  }

  try {
    const payload = {
      name: name.value.trim(),
      description: description.value.trim(),
      item_type: itemType.value,
      price1: Number(price1.value),
      price2: Number(price2.value),
      track_stock: isProduct.value,
      track_batches: isProduct.value,
      track_expiry: isProduct.value ? trackExpiry.value : false,
    }

    let itemId
    if (props.itemToEdit) {
      itemId = props.itemToEdit.id
      await store.dispatch('items/updateItem', { id: itemId, ...payload })
    } else {
      itemId = await store.dispatch('items/addItem', payload)
    }

    if (isProduct.value && Number(adjustmentQty.value) !== 0) {
      const db = await dbPromise
      await db.add('item_batches', {
        item_id: itemId,
        quantity: Number(adjustmentQty.value),
        expiry_date: payload.track_expiry ? (expiryDate.value || null) : null,
        created_at: new Date().toISOString(),
        reason: Number(adjustmentQty.value) > 0 ? 'RESTOCK' : 'ADJUSTMENT'
      })
    }

    await Swal.fire({
      icon: 'success',
      title: props.itemToEdit ? 'Item updated' : 'Item added',
      timer: 1200,
      showConfirmButton: false
    })

    emit('saved')
    emit('close')
  } catch (err) {
    console.error('Failed to save item', err)
    await Swal.fire({
      icon: 'error',
      title: props.itemToEdit ? 'Failed to update item' : 'Failed to add item',
      text: err.message || 'Something went wrong while saving the item.'
    })
  }
}
</script>

<template>
  <div class="modal app-modal-backdrop">
    <div class="modal-content modal-form modal-md item-form-panel">
      <h2>{{ itemToEdit ? 'Edit Item' : 'Add Item' }}</h2>

      <label>Item Name</label>
      <input v-model="name" type="text" />

      <label>Description</label>
      <textarea v-model="description" rows="3"></textarea>

      <label>Item Type</label>
      <select v-model="itemType" :disabled="itemTypeLocked">
        <option v-for="option in itemTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>

      <label>Regular Price</label>
      <input v-model.number="price1" type="number" min="0" />

      <label>Discounted Price (optional)</label>
      <input v-model.number="price2" type="number" min="0" />

      <hr />

      <template v-if="isProduct">
        <h3>Inventory</h3>

        <label class="toggle-row">
          <input v-model="trackExpiry" type="checkbox" :disabled="expiryTrackingRequired" />
          <span>Track expiry dates for this item</span>
        </label>

        <p class="helper-text">
          Stock and batch entries stay on automatically for product items. Turn expiry tracking on only when you want dated stock reminders.
        </p>

        <p v-if="expiryDisabledReason" class="helper-text">
          {{ expiryDisabledReason }}
        </p>

        <p v-if="itemToEdit" class="stock-note">
          Current Stock: <strong>{{ totalStock }}</strong>
        </p>

        <label>Stock Adjustment (+ / -)</label>
        <input v-model.number="adjustmentQty" type="number" />

        <label v-if="trackExpiry">Expiry Date (optional)</label>
        <input v-if="trackExpiry" v-model="expiryDate" type="date" />

        <p v-if="trackExpiry" class="helper-text">
          Use this for reminders only. If expired stock is removed physically, lower the stock total with a negative adjustment.
        </p>
      </template>

      <div class="actions app-modal-actions">
        <button class="primary" :disabled="!isValid" @click="submitForm">
          {{ itemToEdit ? 'Save Changes' : 'Add Item' }}
        </button>
        <button class="secondary" @click="$emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-content {
  max-width: 520px;
  min-height: fit-content;
  max-height: none;
}

.modal-content h2,
.modal-content h3 {
  color: var(--modal-surface-text);
  margin-bottom: 6px;
}

label {
  font-weight: 600;
  color: color-mix(in srgb, var(--modal-surface-text) 82%, transparent);
  font-size: 16px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.helper-text {
  margin: 0 0 12px;
  font-size: 13px;
  color: color-mix(in srgb, var(--modal-surface-text) 72%, transparent);
}

input,
textarea,
select {
  font-size: 16px;
}

textarea {
  resize: vertical;
  min-height: 80px;
}

p {
  color: color-mix(in srgb, var(--modal-surface-text) 76%, transparent);
  font-size: 14px;
}

.stock-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--modal-surface-text) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--modal-surface-text) 12%, transparent);
}

.stock-note strong {
  color: var(--modal-surface-text);
}

hr {
  margin: 12px 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--modal-surface-text) 16%, transparent);
}

@media (max-height: 600px) {
  .actions {
    position: sticky;
    bottom: 0;
    background: var(--modal-surface-bg);
    padding-top: 12px;
    padding-bottom: 4px;
  }
}

.actions button {
  flex: 1;
  font-size: 16px;
}

body.dark-mode .item-form-panel {
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
}

body.dark-mode .item-form-panel h2,
body.dark-mode .item-form-panel h3 {
  color: #f8fafc;
}

body.dark-mode .item-form-panel label {
  color: #d7e1ea;
}

body.dark-mode .item-form-panel p {
  color: #c2ced9;
}

body.dark-mode .item-form-panel .stock-note {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.16);
}

body.dark-mode .item-form-panel .stock-note strong {
  color: #f8fafc;
}

body.dark-mode .item-form-panel hr {
  border-top-color: rgba(148, 163, 184, 0.22);
}

@media (max-width: 768px) {
  .item-form-panel {
    max-width: 100%;
  }
}
</style>