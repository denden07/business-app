<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'
import SearchInput from '../components/SearchInput.vue'
import { useStore } from 'vuex'
import Swal from 'sweetalert2'
import { useRouter } from 'vue-router'
import Pagination from '../components/Pagination.vue'
import IconActionButton from '../components/IconActionButton.vue'
import {
  isCustomerSelectionRequired,
  isLoyaltyEnabled,
} from '../utils/templatePresentation'
import { formatCurrency } from '../utils/numberFormat'

const store = useStore()

/* ======================
   STATE
====================== */
const page = ref(1)
const route = useRoute()
const perPage = ref(10)

const search = ref('')
const debtFilter = ref('all')
const sortBy = ref('id')    // created_at | name
const sortOrder = ref('desc')        // asc | desc
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const loyaltyEnabled = computed(() => isLoyaltyEnabled(activeTemplate.value))
const customerSelectionRequired = computed(() => isCustomerSelectionRequired(activeTemplate.value))
const showPointsFeatures = computed(() => loyaltyEnabled.value)

/* ======================
   COLUMN VISIBILITY
====================== */
const _custDefaultCols = { name: true, address: true, outstanding_debt: true, points: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._custDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-customers') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-customers', JSON.stringify(v)), { deep: true })
const allCols = computed(() => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'address', label: 'Address' },
    { key: 'outstanding_debt', label: 'Outstanding Debt' },
  ]

  if (showPointsFeatures.value) {
    columns.push({ key: 'points', label: 'Points' })
  }

  return columns
})
const visibleColumnCount = computed(() => allCols.value.filter(col => visibleCols.value[col.key]).length + 1)
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }

const modal = ref(null)
const pointsModal = ref(null)

const form = ref({
  id: null,
  name: '',
  phone: '',
  email: '',
  address: ''
})

const pointsForm = reactive({
  customer_id: null,
  points: 0,
  note: ''
})

/* ======================
   COMPUTED
====================== */
const customers = computed(() => store.state.customers.page || [])
const total = computed(() => store.state.customers.total || 0)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / perPage.value))
)
const paginated = computed(() =>
  customers.value.map(c => ({
    ...c,
    points: Number(c.points ?? 0),
    outstanding_debt: Number(c.outstanding_debt ?? 0),
  }))
)

const fmtMoney = (value) => formatCurrency(value)


const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, i) => i + 1)
)

/* ======================
   LOAD
====================== */
const load = async () => {
  await store.dispatch('customers/loadCustomersPage', {
    page: page.value,
    perPage: perPage.value,
    search: search.value,
    debtFilter: debtFilter.value,
    sortBy: !showPointsFeatures.value && sortBy.value === 'points' ? 'id' : sortBy.value,
    sortOrder: sortOrder.value
  })
}

/* ======================
   WATCHERS
====================== */
watch([search, debtFilter, sortBy, sortOrder, perPage], () => {
  page.value = 1
  load()
})

watch(page, () => load())

watch(showPointsFeatures, enabled => {
  if (!enabled) {
    visibleCols.value.points = false
    if (sortBy.value === 'points') {
      sortBy.value = 'id'
    }
  }
}, { immediate: true })

/* ======================
   PAGINATION
====================== */
function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}

/* ======================
   CUSTOMER MODAL
====================== */
function openAdd() {
  form.value = { id: null, name: '', phone: '', email: '', address: '' }
  modal.value.showModal()
}

function openEdit(c) {
  form.value = { ...c }
  modal.value.showModal()
}

function close() {
  modal.value.close()
  // reset form when modal closes
  form.value = { id: null, name: '', phone: '', email: '', address: '' }
}

/* ======================
   SAVE CUSTOMER
====================== */
async function save() {
  if (!form.value.name) {
    await Swal.fire({
      icon: 'warning',
      title: 'Name is required',
      text: 'Please enter a customer name before saving.'
    })
    return
  }

  try {
    const isEditing = !!form.value.id

    if (isEditing) {
      await store.dispatch('customers/editCustomer', form.value)
    } else {
      await store.dispatch('customers/addCustomer', form.value)
    }

    close()
    await load()
    await Swal.fire({
      icon: 'success',
      title: isEditing ? 'Customer updated' : 'Customer added',
      timer: 1200,
      showConfirmButton: false
    })
  } catch (err) {
    console.error('Failed to save customer', err)
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: err.message || 'Unable to save the customer.'
    })
  }
}

/* ======================
   DELETE CUSTOMER
====================== */
async function remove(c) {
  const ok = await Swal.fire({
    title: 'Delete customer?',
    text: 'This cannot be undone',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e74c3c',
    confirmButtonText: 'Delete'
  })

  if (!ok.isConfirmed) return

  try {
    await store.dispatch('customers/deleteCustomer', c)
    await load()
    await Swal.fire({
      icon: 'success',
      title: 'Customer deleted',
      timer: 1200,
      showConfirmButton: false
    })
  } catch (err) {
    console.error('Failed to delete customer', err)
    await Swal.fire({
      icon: 'error',
      title: 'Delete failed',
      text: err.message || 'Unable to delete this customer.'
    })
  }
}

/* ======================
   POINTS MODAL
====================== */
function openPointsModal(c) {
  if (!showPointsFeatures.value) return

  pointsForm.customer_id = c.id
  pointsForm.points = 0
  pointsForm.note = ''
  pointsModal.value.showModal()
}

function closePointsModal() {
  pointsModal.value.close()
  // reset points form
  pointsForm.customer_id = null
  pointsForm.points = 0
  pointsForm.note = ''
}

async function savePointsAdjustment() {
  if (!pointsForm.points) {
    await Swal.fire({
      icon: 'warning',
      title: 'No points entered',
      text: 'Enter points to add or deduct before saving.'
    })
    return
  }

  const payload = {
    customer_id: pointsForm.customer_id,
    points: Number(pointsForm.points),
    note: pointsForm.note
  }

  closePointsModal()
  const confirm = await Swal.fire({
    title: 'Confirm points adjustment?',
    text: `Apply ${payload.points > 0 ? 'add' : 'deduct'} points?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, continue'
  })

  if (!confirm.isConfirmed) return

  try {
    await store.dispatch('customers/addManualPoints', payload)

    await load()
    await Swal.fire({
      icon: 'success',
      title: 'Points updated',
      timer: 1200,
      showConfirmButton: false
    })
    closePointsModal()
  } catch (err) {
    console.error('Failed to update points', err)
    await Swal.fire({
      icon: 'error',
      title: 'Update failed',
      text: err.message || 'Unable to update customer points.'
    })
  }
}

/* ======================
   INIT
====================== */
onMounted(() => {
  const q = route.query
  const qPage = Number(q.page || 0)
  if (qPage && qPage > 0) page.value = qPage
  if (q.search !== undefined) search.value = q.search
  if (q.debtFilter) debtFilter.value = q.debtFilter
  const qPer = Number(q.perPage || 0)
  if (qPer && qPer > 0) perPage.value = qPer
  if (q.sortBy) sortBy.value = !showPointsFeatures.value && q.sortBy === 'points' ? 'id' : q.sortBy
  if (q.sortOrder) sortOrder.value = q.sortOrder
  load()
  // ensure native dialog close resets forms if user dismisses via ESC/outside click
  if (modal.value) {
    modal.value.addEventListener('close', () => {
      form.value = { id: null, name: '', phone: '', email: '', address: '' }
    })
  }
  if (pointsModal.value) {
    pointsModal.value.addEventListener('close', () => {
      pointsForm.customer_id = null
      pointsForm.points = 0
      pointsForm.note = ''
    })
  }
})

const router = useRouter()

function goToTransactionHistory(customerId) {
  router.push({
    name: 'TransactionHistory',
    params: { id: customerId },
    query: {
      tab: showPointsFeatures.value ? 'points' : 'purchases',
      page: page.value,
      search: search.value || undefined,
      debtFilter: debtFilter.value !== 'all' ? debtFilter.value : undefined,
      perPage: perPage.value,
      sortBy: !showPointsFeatures.value && sortBy.value === 'points' ? 'id' : sortBy.value,
      sortOrder: sortOrder.value
    }
  })
}
</script>

<template>
  <div class="page-shell">
    <h1>Customers</h1>
    <p v-if="!showPointsFeatures && customerSelectionRequired" class="page-subtitle">
      Customer records stay available for required checkout selection, but loyalty and points tools are hidden for this template.
    </p>

    <!-- Top bar -->
      <div class="top-bar">
        <SearchInput v-model="search" placeholder="Search name / phone / email" :inputClass="'input'" />

        <select v-model.number="perPage" class="select-field per-page">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
        </select>

        <select v-model="debtFilter" class="select-field">
          <option value="all">All Customers</option>
          <option value="has-debt">Has Debt</option>
          <option value="no-debt">No Debt</option>
        </select>

        <select v-model="sortBy" class="select-field">
        <option value="id">Newest</option>
        <option value="name">Name</option>
        <option value="outstanding_debt">Outstanding Debt</option>
        <option v-if="showPointsFeatures" value="points">Points</option>
        </select>

        <select v-model="sortOrder" class="select-field">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>

        <button @click="openAdd">Add Customer</button>
      </div>

    <!-- Table -->
    <div class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
      <table class="table w-full">
        <thead>
          <tr>
            <th v-if="visibleCols.name">Name</th>
            <th v-if="visibleCols.address">Address</th>
            <th v-if="visibleCols.outstanding_debt">Outstanding Debt</th>
            <th v-if="showPointsFeatures && visibleCols.points">Points</th>
            <th class="col-actions">
              <div class="th-actions-head">
                Actions
                <div class="col-toggle-wrap">
                  <button class="col-icon-btn" @click.stop="colMenuOpen = !colMenuOpen" title="Show / hide columns"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  <div v-if="colMenuOpen" class="col-menu-backdrop" @click="colMenuOpen = false" />
                  <div v-if="colMenuOpen" class="col-menu">
                    <div class="col-menu-title">Columns</div>
                    <label v-for="col in allCols" :key="col.key"><input type="checkbox" :checked="visibleCols[col.key]" @change="toggleCol(col.key)" /> {{ col.label }}</label>
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in paginated" :key="c.id" @click="goToTransactionHistory(c.id)" style="cursor: pointer;">
            <td v-if="visibleCols.name">{{ c.name }}</td>
            <td v-if="visibleCols.address">{{ c.address || '-' }}</td>
            <td v-if="visibleCols.outstanding_debt" :class="c.outstanding_debt > 0 ? 'debt-cell' : ''">{{ fmtMoney(c.outstanding_debt) }}</td>
            <td v-if="showPointsFeatures && visibleCols.points">{{ c.points }}</td>
            <td class="col-actions actions-td">
              <IconActionButton icon="edit" label="Edit customer" variant="warning" @click.stop="openEdit(c)" />
              <IconActionButton icon="delete" label="Delete customer" variant="danger" @click.stop="remove(c)" />
              <IconActionButton v-if="showPointsFeatures" icon="points" label="Adjust points" variant="secondary" @click.stop="openPointsModal(c)" />
            </td>
          </tr>
          <tr v-if="!paginated.length">
            <td :colspan="visibleColumnCount" class="empty-state-cell">No customers found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <Pagination v-model:page="page" :total-pages="totalPages" :max-pages="5" />

    <!-- CUSTOMER MODAL -->
    <dialog ref="modal" class="modal app-modal-dialog modal-sm">
      <h3>{{ form.id ? 'Edit Customer' : 'Add Customer' }}</h3>

      <div class="modal-form">
        <input v-model="form.name" placeholder="Name" />
        <input v-model="form.address" placeholder="Address" />
        <input v-model="form.phone" placeholder="Phone" />
        <input v-model="form.email" placeholder="Email" />
      </div>

      <div class="modal-actions">
        <button class="secondary" @click="close">Cancel</button>
        <button @click="save">Save</button>
      </div>
    </dialog>

    <!-- POINTS MODAL -->
    <dialog v-if="showPointsFeatures" ref="pointsModal" class="modal app-modal-dialog modal-sm">
      <h3>Adjust Customer Points</h3>

      <div class="modal-form">
        <input
          type="number"
          v-model.number="pointsForm.points"
          placeholder="Points (+ add / - deduct)"
        />
        <input v-model="pointsForm.note" placeholder="Note (optional)" />
      </div>

      <div class="modal-actions">
        <button class="secondary" @click="closePointsModal">Cancel</button>
        <button @click="savePointsAdjustment">Save</button>
      </div>
    </dialog>
  </div>
</template>


<style scoped>
/* ======================
   PAGE
====================== */
.page-shell {
  padding: 20px;
}

.debt-cell {
  color: #b45309;
  font-weight: 700;
}

/* ======================
   MODAL
====================== */
/* STACK INPUTS */
.modal-form {
  gap: 12px;
  margin: 14px 0;
}

/* ======================
   MOBILE
====================== */
@media (max-width: 768px) {
  .modal-actions > button {
    width: 100%;
  }
}


</style>
