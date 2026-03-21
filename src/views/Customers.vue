<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'
import SearchInput from '../components/SearchInput.vue'
import { useStore } from 'vuex'
import Swal from 'sweetalert2'
import { useRouter } from 'vue-router'
import Pagination from '../components/Pagination.vue'

const store = useStore()

/* ======================
   STATE
====================== */
const page = ref(1)
const route = useRoute()
const perPage = ref(10)

const search = ref('')
const sortBy = ref('id')    // created_at | name
const sortOrder = ref('desc')        // asc | desc

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
    points: Number(c.points ?? 0)
  }))
)


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
    sortBy: sortBy.value,
    sortOrder: sortOrder.value
  })
}

/* ======================
   WATCHERS
====================== */
watch([search, sortBy, sortOrder, perPage], () => {
  page.value = 1
  load()
})

watch(page, () => load())

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
  if (!form.value.name) return

  if (form.value.id) {
    await store.dispatch('customers/editCustomer', form.value)
  } else {
    await store.dispatch('customers/addCustomer', form.value)
  }

  close()
  await load()
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

  await store.dispatch('customers/deleteCustomer', c)
  await load()
}

/* ======================
   POINTS MODAL
====================== */
function openPointsModal(c) {
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
  if (!pointsForm.points) return
  closePointsModal()
  const confirm = await Swal.fire({
    title: 'Confirm points adjustment?',
    text: `Apply ${pointsForm.points > 0 ? 'add' : 'deduct'} points?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, continue'
  })

  if (!confirm.isConfirmed) return

  await store.dispatch('customers/addManualPoints', {
    customer_id: pointsForm.customer_id,
    points: pointsForm.points,
    note: pointsForm.note
  })

  Swal.fire({
    icon: 'success',
    title: 'Points updated',
    timer: 1200,
    showConfirmButton: false
  })

  closePointsModal()
  await load()
}

/* ======================
   INIT
====================== */
onMounted(() => {
  const q = route.query
  const qPage = Number(q.page || 0)
  if (qPage && qPage > 0) page.value = qPage
  if (q.search !== undefined) search.value = q.search
  const qPer = Number(q.perPage || 0)
  if (qPer && qPer > 0) perPage.value = qPer
  if (q.sortBy) sortBy.value = q.sortBy
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
      page: page.value,
      search: search.value || undefined,
      perPage: perPage.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    }
  })
}
</script>

<template>
  <div class="medicines-page">
    <h1>Customers</h1>

    <!-- Top bar -->
      <div class="top-bar">
        <SearchInput v-model="search" placeholder="Search name / phone / email" :inputClass="'input'" />

        <select v-model.number="perPage" class="input per-page">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
        </select>

        <select v-model="sortBy" class="input">
        <option value="id">Newest</option>
        <option value="name">Name</option>
        <option value="points">Points</option>
        </select>

        <select v-model="sortOrder" class="input">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>

        <button @click="openAdd">Add Customer</button>
      </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="table w-full">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Points</th>
            <th class="w-48">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in paginated" :key="c.id"   @click="goToTransactionHistory(c.id)"
  style="cursor: pointer;">
            <td>{{ c.name }}</td>
            <td>{{ c.address || '-' }}</td>
            <td class="font-semibold">{{ c.points }}</td>
            <td class="flex gap-1" style="
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                ">
              <button class="btn-sm" @click.stop="openEdit(c)">Edit</button>
              <button class="btn-sm danger" @click.stop="remove(c)">Delete</button>
              <button class="secondary" @click.stop="openPointsModal(c)">Adjust Points</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <Pagination v-model:page="page" :total-pages="totalPages" :max-pages="5" />

    <!-- CUSTOMER MODAL -->
    <dialog ref="modal" class="modal">
      <h3>{{ form.id ? 'Edit Customer' : 'Add Customer' }}</h3>

      <div class="modal-form">
        <input v-model="form.name" placeholder="Name" />
        <input v-model="form.address" placeholder="Address" />
        <input v-model="form.phone" placeholder="Phone" />
        <input v-model="form.email" placeholder="Email" />
      </div>

      <div class="modal-actions">
        <button class="danger" @click="close">Cancel</button>
        <button @click="save">Save</button>
      </div>
    </dialog>

    <!-- POINTS MODAL -->
    <dialog ref="pointsModal" class="modal">
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
        <button class="danger" @click="closePointsModal">Cancel</button>
        <button @click="savePointsAdjustment">Save</button>
      </div>
    </dialog>
  </div>
</template>


<style scoped>
/* ======================
   PAGE
====================== */
.medicines-page {
  padding: 20px;
}

/* ======================
   TOP BAR
====================== */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.top-bar h1 {
  font-size: 20px;
  font-weight: 600;
}

.top-bar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

/* ======================
   INPUTS (GLOBAL)
====================== */
.input,
select,
input {
  height: 44px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background-color: #fff;
  color: #222;
  font-size: 15px;
}

input::placeholder {
  color: #888;
}

input:focus,
select:focus {
  outline: none;
  border-color: #1abc9c;
  box-shadow: 0 0 0 2px rgba(26, 188, 156, 0.2);
}

body.dark-mode input,
body.dark-mode select {
  background-color: #1c1c1c;
  border-color: #333;
  color: #eee;
}

body.dark-mode input::placeholder {
  color: #aaa;
}

/* ======================
   BUTTONS
====================== */
button {
  height: 44px;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background-color: #1abc9c;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
}

body.dark-mode button {
  background-color: #16a085;
}

.danger {
  background-color: #e74c3c;
}

/* ======================
   TABLE
====================== */
table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #ccc;
  padding: 8px;
}

body.dark-mode th,
body.dark-mode td {
  border-color: #333;
}

.actions-td {
  display: flex;
  gap: 6px;
}

/* ======================
   PAGINATION
====================== */
.pagination {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}

/* ======================
   MODAL
====================== */
.modal {
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-width: 420px;
  background-color: #fff;
  position: absolute;
  z-index: 10;
}

body.dark-mode .modal {
  background-color: #1e1e1e;
  color: #eee;
}

/* STACK INPUTS */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 14px 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ======================
   MOBILE
====================== */
@media (max-width: 768px) {
  .top-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .top-bar-actions {
    flex-direction: column;
  }

  button {
    width: 100%;
  }
}


</style>
