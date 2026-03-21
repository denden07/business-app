<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

const store = useStore()
const router = useRouter()

const drafts = computed(() => store.state.drafts.drafts)

onMounted(() => {
  store.dispatch('drafts/load')
})

const resumeDraft = (draft) => {
  router.push({ path: '/', query: { draft: draft.id } })
}

/* ======================
   COLUMN VISIBILITY
====================== */
const _draftsDefaultCols = { draft_num: true, name: true, cart: true, customer: true, created_at: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._draftsDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-drafts') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-drafts', JSON.stringify(v)), { deep: true })
const allCols = [
  { key: 'draft_num', label: '#' },
  { key: 'name', label: 'Label' },
  { key: 'cart', label: 'Items' },
  { key: 'customer', label: 'Customer' },
  { key: 'created_at', label: 'Saved At' },
]
const toggleCol = (key) => { visibleCols.value[key] = !visibleCols.value[key] }

const deleteDraft = async (draft) => {
  const confirm = await Swal.fire({
    title: 'Delete this draft?',
    text: draft.name,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel'
  })
  if (!confirm.isConfirmed) return
  await store.dispatch('drafts/remove', draft.id)
}
</script>

<template>
  <div class="medicines-page">
    <h1>Drafts</h1>

    <div class="top-bar">
      <button @click="router.push('/')">+ New Sale</button>
    </div>

    <div v-if="!drafts.length" class="empty-state">
      No saved drafts yet.
    </div>

    <div v-if="drafts.length" class="table-wrap" :class="{ 'table-wrap-menu-open': colMenuOpen }">
    <table>
      <thead>
        <tr>
          <th v-if="visibleCols.draft_num">#</th>
          <th v-if="visibleCols.name">Label</th>
          <th v-if="visibleCols.cart">Items</th>
          <th v-if="visibleCols.customer">Customer</th>
          <th v-if="visibleCols.created_at">Saved At</th>
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
        <tr v-for="draft in drafts" :key="draft.id">
          <td v-if="visibleCols.draft_num">{{ draft.id }}</td>
          <td v-if="visibleCols.name">{{ draft.name }}</td>
          <td v-if="visibleCols.cart">{{ draft.cart?.length ?? 0 }} item(s)</td>
          <td v-if="visibleCols.customer">{{ draft.customer?.name ?? 'Walk-in' }}</td>
          <td v-if="visibleCols.created_at">{{ new Date(draft.created_at).toLocaleString() }}</td>
          <td class="col-actions actions-td">
            <button class="primary btn" @click="resumeDraft(draft)">▶ Resume</button>
            <button class="danger btn" @click="deleteDraft(draft)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  </div>
</template>

<style scoped>
.medicines-page { margin: auto; padding: 20px; overflow-x: hidden; }
body.dark-mode .medicines-page { background-color: #121212; color: #eee; }

h1 { margin-bottom: 16px; }

.empty-state {
  margin-top: 40px;
  text-align: center;
  color: #888;
  font-size: 16px;
}

.actions-td { display: flex; gap: 8px; }

@media (max-width: 768px) {
  .actions-td { flex-direction: column; }
}
</style>
