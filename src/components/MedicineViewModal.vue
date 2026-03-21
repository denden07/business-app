<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { dbPromise } from '../db'

const props = defineProps({
  show: Boolean,
  medicine: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const totalStock = ref(0)
const batches = ref([])
const priceHistory = ref([])

// Collapsible sections
const showStock = ref(true)
const showPriceHistory = ref(false)

const loadData = async () => {
  if (!props.medicine) return

  const db = await dbPromise

  // =====================
  // INVENTORY
  // =====================
  const batchIndex = db
    .transaction('inventory_batches')
    .objectStore('inventory_batches')
    .index('medicine_id')

  const allBatches = await batchIndex.getAll(IDBKeyRange.only(props.medicine.id))
  batches.value = allBatches.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  totalStock.value = batches.value.reduce((sum, b) => sum + (b.quantity || 0), 0)

  // =====================
  // PRICE HISTORY
  // =====================
  const priceIndex = db
    .transaction('price_history')
    .objectStore('price_history')
    .index('medicine_id')

  const allPrices = await priceIndex.getAll(IDBKeyRange.only(props.medicine.id))
  priceHistory.value = allPrices.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
}

watch(() => props.medicine, loadData)
watch(() => props.show, (v) => v && loadData())
onMounted(loadData)

const formatDate = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString()
}
</script>

<template>
  <div v-if="show" class="modal app-modal-backdrop">
    <div class="modal-content modal-lg">
      <h2>Medicine Details</h2>

      <p><strong>Brand:</strong> {{ medicine.name }}</p>
      <p><strong>Generic:</strong> {{ medicine.generic_name || '—' }}</p>

      <p><strong>Price 1:</strong> ₱{{ medicine.price1 }}</p>
      <p><strong>Price 2:</strong> ₱{{ medicine.price2 }}</p>

      <hr />

      <!-- Stock Section -->
      <div class="section">
        <div class="section-header" @click="showStock = !showStock">
          <h3>Stock Information</h3>
          <span>{{ showStock ? '▼' : '►' }}</span>
        </div>
        <div v-if="showStock" class="section-body">
          <p><strong>Total Stock:</strong> {{ totalStock }}</p>

          <table v-if="batches.length">
            <thead>
              <tr>
                <th>Date</th>
                <th>Qty</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in batches" :key="b.id">
                <td>{{ formatDate(b.created_at) }}</td>
                <td>{{ b.quantity }}</td>
                <td>{{ b.expiry_date ? formatDate(b.expiry_date) : 'No Expiry' }}</td>
              </tr>
            </tbody>
          </table>



          <p v-else>No stock records</p>
        </div>
      </div>

      <hr />

      <!-- Price History Section -->
      <div class="section">
        <div class="section-header" @click="showPriceHistory = !showPriceHistory">
          <h3>Price History</h3>
          <span>{{ showPriceHistory ? '▼' : '►' }}</span>
        </div>
        <div v-if="showPriceHistory" class="section-body">
          <table v-if="priceHistory.length">
            <thead>
              <tr>
                <th>Date</th>
                <th>Regular</th>
                <th>Discount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in priceHistory" :key="p.id">
                <td>{{ new Date(p.changed_at).toLocaleDateString() }}</td>
                <td>₱{{ p.price1 }}</td>
                <td>₱{{ p.price2 }}</td>
              </tr>
            </tbody>
          </table>

          <p v-else>No price changes recorded</p>
        </div>
      </div>

      <div class="actions app-modal-actions">
        <button @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-content {
  max-width: 520px;
}

h2, h3 {
  margin-bottom: 8px;
}

p {
  font-size: 14px;
  margin: 4px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}

th, td {
  border-bottom: 1px solid #ddd;
  padding: 6px;
  font-size: 13px;
  text-align: left;
}

hr {
  margin: 12px 0;
  border: none;
  border-top: 1px solid #ccc;
}

/* Collapsible Section */
.section {
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background: #f1f1f1;
  padding: 6px 10px;
  border-radius: 6px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
}

.section-header span {
  font-size: 16px;
}

</style>
