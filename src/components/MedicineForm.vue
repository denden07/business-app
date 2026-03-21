<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useStore } from 'vuex'
import { dbPromise } from '../db'

const props = defineProps({
  medicineToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])
const store = useStore()

/* =====================
   Medicine fields
===================== */
const name = ref('')
const genericName = ref('')
const price1 = ref(0)
const price2 = ref(0)

/* =====================
   Inventory fields
===================== */
const adjustmentQty = ref(0)        // + / -
const expiryDate = ref('')
const totalStock = ref(0)

/* =====================
   Load total stock
===================== */
const loadTotalStock = async (medicineId) => {
  if (!medicineId) {
    totalStock.value = 0
    return
  }

  const db = await dbPromise
  const index = db
    .transaction('inventory_batches')
    .objectStore('inventory_batches')
    .index('medicine_id')

  const batches = await index.getAll(IDBKeyRange.only(medicineId))
  totalStock.value = batches.reduce(
    (sum, b) => sum + Number(b.quantity || 0),
    0
  )
}

/* =====================
   Load data into modal
===================== */
const loadMedicineData = async (medicine) => {
  name.value = medicine?.name || ''
  genericName.value = medicine?.generic_name || ''
  price1.value = medicine?.price1 || 0
  price2.value = medicine?.price2 || 0
  adjustmentQty.value = 0
  expiryDate.value = ''

  if (medicine?.id) {
    await loadTotalStock(medicine.id)
  } else {
    totalStock.value = 0
  }
}

watch(() => props.medicineToEdit, loadMedicineData, { immediate: true })
onMounted(() => loadMedicineData(props.medicineToEdit))

/* =====================
   Validation
===================== */
const isValid = computed(() => {
  return (
    name.value.trim() !== '' &&
    price1.value > 0
  )
})

/* =====================
   Submit
===================== */
const submitForm = async () => {
  if (!isValid.value) {
    alert('Please fill all required fields')
    return
  }

  const medicinePayload = {
    name: name.value.trim(),
    generic_name: genericName.value.trim(),
    price1: Number(price1.value),
    price2: Number(price2.value)
  }

  let medicineId

  /* ---------- SAVE MEDICINE ---------- */
  if (props.medicineToEdit) {
    medicineId = props.medicineToEdit.id
    await store.dispatch('medicines/updateMedicine', {
      id: medicineId,
      ...medicinePayload
    })
  } else {
    await store.dispatch('medicines/addMedicine', medicinePayload)

    // get last inserted medicine safely
    const db = await dbPromise
    const all = await db.getAll('medicines')
    medicineId = all[all.length - 1].id
  }

  /* ---------- STOCK ADJUSTMENT ---------- */
  if (adjustmentQty.value !== 0) {
    const db = await dbPromise
    await db.add('inventory_batches', {
      medicine_id: medicineId,
      quantity: Number(adjustmentQty.value), // can be + or -
      expiry_date: expiryDate.value || null,
      created_at: new Date().toISOString(),
      reason: adjustmentQty.value > 0 ? 'RESTOCK' : 'ADJUSTMENT'
    })
  }

  emit('saved')
  emit('close')
}
</script>

<template>
  <div class="modal app-modal-backdrop">
    <div class="modal-content modal-form modal-md medicine-form-panel">
      <h2>{{ medicineToEdit ? 'Edit Medicine' : 'Add Medicine' }}</h2>

      <label>Brand Name</label>
      <input v-model="name" type="text" />

      <label>Generic Name</label>
      <input v-model="genericName" type="text" />

      <label>Regular Price</label>
      <input v-model.number="price1" type="number" min="0" />

      <label>Discounted Price (optional)</label>
      <input v-model.number="price2" type="number" min="0" />

      <hr />

      <h3>Inventory</h3>

      <p v-if="medicineToEdit" class="stock-note">
        Current Stock: <strong>{{ totalStock }}</strong>
      </p>

      <label>Stock Adjustment (+ / -)</label>
      <input v-model.number="adjustmentQty" type="number" />

      <label>Expiry Date (optional)</label>
      <input v-model="expiryDate" type="date" />

      <div class="actions app-modal-actions">
        <button class="primary" :disabled="!isValid" @click="submitForm">
          {{ medicineToEdit ? 'Save Changes' : 'Add Medicine' }}
        </button>
        <button class="secondary" @click="$emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-content {
  max-width: 460px;
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

input {
  font-size: 16px; /* prevents zoom on Android */
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

body.dark-mode .medicine-form-panel {
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
}

body.dark-mode .medicine-form-panel h2,
body.dark-mode .medicine-form-panel h3 {
  color: #f8fafc;
}

body.dark-mode .medicine-form-panel label {
  color: #d7e1ea;
}

body.dark-mode .medicine-form-panel p {
  color: #c2ced9;
}

body.dark-mode .medicine-form-panel .stock-note {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.16);
}

body.dark-mode .medicine-form-panel .stock-note strong {
  color: #f8fafc;
}

body.dark-mode .medicine-form-panel hr {
  border-top-color: rgba(148, 163, 184, 0.22);
}

@media (max-width: 768px) {
  .medicine-form-panel {
    max-width: 100%;
  }
}


</style>
