<script setup>
import { computed, onMounted } from 'vue'
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

    <table v-else>
      <thead>
        <tr>
          <th>#</th>
          <th>Label</th>
          <th>Items</th>
          <th>Customer</th>
          <th>Saved At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="draft in drafts" :key="draft.id">
          <td>{{ draft.id }}</td>
          <td>{{ draft.name }}</td>
          <td>{{ draft.cart?.length ?? 0 }} item(s)</td>
          <td>{{ draft.customer?.name ?? 'Walk-in' }}</td>
          <td>{{ new Date(draft.created_at).toLocaleString() }}</td>
          <td class="actions-td">
            <button @click="resumeDraft(draft)">▶ Resume</button>
            <button class="danger" @click="deleteDraft(draft)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.medicines-page { margin: auto; padding: 20px; overflow-x: hidden; }
body.dark-mode .medicines-page { background-color: #121212; color: #eee; }

h1 { margin-bottom: 16px; }

.top-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }

.empty-state {
  margin-top: 40px;
  text-align: center;
  color: #888;
  font-size: 16px;
}

table { width: 100%; border-collapse: collapse; white-space: nowrap; }
th, td { border: 1px solid #ccc; padding: 8px; }
body.dark-mode table, body.dark-mode th, body.dark-mode td { border-color: #333; }

button { min-height: 40px; padding: 8px 14px; border-radius: 8px; border: none; background-color: #1abc9c; color: #fff; cursor: pointer; }
body.dark-mode button { background-color: #16a085; }

.actions-td { display: flex; gap: 8px; }
.danger { background-color: #e74c3c; }
.danger:hover { background-color: #c0392b; }

@media (max-width: 768px) {
  .top-bar { flex-direction: column; }
  button { width: 100%; }
  .actions-td { flex-direction: column; }
}
</style>
