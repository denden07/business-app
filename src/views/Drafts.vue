<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import Pagination from '../components/Pagination.vue'
import {
  getTemplateCatalogEntryLabel,
  getTemplateCatalogLabel,
  getTemplateCustomerSectionLabel,
  getTemplatePaymentLabel,
  getTemplateProfessionalFeeLabel,
} from '../utils/templatePresentation'

const store = useStore()
const router = useRouter()

const drafts = computed(() => store.state.drafts.drafts)
const currentPage = computed({
  get: () => store.state.drafts.currentPage,
  set: (value) => store.commit('drafts/SET_CURRENT_PAGE', value)
})
const itemsPerPage = computed({
  get: () => store.state.drafts.itemsPerPage,
  set: (value) => store.commit('drafts/SET_ITEMS_PER_PAGE', value)
})
const totalCount = computed(() => store.state.drafts.totalCount)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / itemsPerPage.value)))
const itemsPerPageOptions = [5, 10, 20, 50]
const showDetailsModal = ref(false)
const selectedDraft = ref(null)
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const templateLabels = computed(() => activeTemplate.value.labels || {})
const catalogLabel = computed(() => getTemplateCatalogLabel(templateLabels.value))
const catalogEntryLabel = computed(() => getTemplateCatalogEntryLabel(templateLabels.value))
const customerSectionLabel = computed(() => getTemplateCustomerSectionLabel(templateLabels.value))
const professionalFeeLabel = computed(() => getTemplateProfessionalFeeLabel(templateLabels.value))
const formatPaymentMethod = (value) => getTemplatePaymentLabel(value, templateLabels.value)

onMounted(() => {
  store.dispatch('drafts/loadPage')
})

watch([currentPage, itemsPerPage], () => {
  store.dispatch('drafts/loadPage', {
    page: currentPage.value,
    perPage: itemsPerPage.value
  })
})

const resumeDraft = (draft) => {
  router.push({ path: '/', query: { draft: draft.id } })
}

const selectedDraftItems = computed(() => selectedDraft.value?.cart || [])
const selectedDraftCustomer = computed(() => selectedDraft.value?.customer || null)
const selectedDraftSubtotal = computed(() =>
  selectedDraftItems.value.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0)
)
const selectedDraftDiscount = computed(() => Number(selectedDraft.value?.specialDiscount || 0) + Number(selectedDraft.value?.pointsConfirmed ? selectedDraft.value?.customerPoints * selectedDraft.value?.redeemMultiplier : 0))
const selectedDraftGrandTotal = computed(() =>
  Math.max(selectedDraftSubtotal.value + Number(selectedDraft.value?.professionalFee || 0) - selectedDraftDiscount.value, 0)
)

const openDetailsModal = (draft) => {
  selectedDraft.value = draft
  showDetailsModal.value = true
}

const closeDetailsModal = () => {
  showDetailsModal.value = false
  selectedDraft.value = null
}

const formatDraftItemCount = (count) => {
  const normalizedCount = Number(count || 0)
  const singularLabel = catalogEntryLabel.value
  const pluralLabel = catalogLabel.value

  return `${normalizedCount} ${normalizedCount === 1 ? singularLabel : pluralLabel}`
}

/* ======================
   COLUMN VISIBILITY
====================== */
const _draftsDefaultCols = { draft_num: true, name: true, cart: true, customer: true, created_at: true }
const colMenuOpen = ref(false)
const visibleCols = ref({ ..._draftsDefaultCols, ...JSON.parse(localStorage.getItem('col-vis-drafts') || '{}') })
watch(visibleCols, v => localStorage.setItem('col-vis-drafts', JSON.stringify(v)), { deep: true })
const allCols = computed(() => [
  { key: 'draft_num', label: '#' },
  { key: 'name', label: 'Label' },
  { key: 'cart', label: catalogLabel.value },
  { key: 'customer', label: customerSectionLabel.value },
  { key: 'created_at', label: 'Saved At' },
])
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

const goPage = (page) => {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <div class="page-shell">
    <h1>Drafts</h1>

    <div class="top-bar">
      <button @click="router.push('/')">+ New Sale</button>
      <div class="items-per-page">
        <label>Items:</label>
        <select v-model.number="itemsPerPage" class="select-field">
          <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
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
          <th v-if="visibleCols.cart">{{ catalogLabel }}</th>
          <th v-if="visibleCols.customer">{{ customerSectionLabel }}</th>
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
          <td v-if="visibleCols.cart">{{ formatDraftItemCount(draft.cart?.length) }}</td>
          <td v-if="visibleCols.customer">{{ draft.customer?.name ?? 'Walk-in' }}</td>
          <td v-if="visibleCols.created_at">{{ new Date(draft.created_at).toLocaleString() }}</td>
          <td class="col-actions actions-td">
            <button class="secondary btn" @click="openDetailsModal(draft)">View</button>
            <button class="primary btn" @click="resumeDraft(draft)">▶ Resume</button>
            <button class="danger btn" @click="deleteDraft(draft)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
    </div>

    <Pagination
      v-if="drafts.length"
      :page="currentPage"
      :total-pages="totalPages"
      :max-pages="5"
      @update:page="goPage"
    />

    <div v-if="showDetailsModal && selectedDraft" class="modal-backdrop app-modal-backdrop draft-modal-backdrop">
      <div class="modal app-modal-panel modal-lg draft-details-modal">
        <div class="sale-header">
          <div>
            <h2>{{ selectedDraft.name || `Draft #${selectedDraft.id}` }}</h2>
            <div class="sale-meta">
              Saved {{ new Date(selectedDraft.created_at).toLocaleString() }}
            </div>
            <div class="sale-meta">
              {{ customerSectionLabel }}: {{ selectedDraftCustomer ? selectedDraftCustomer.name : 'Walk-in' }}
            </div>
            <div class="sale-meta">
              Payment: {{ formatPaymentMethod(selectedDraft.paymentMethod) }}
            </div>
            <div v-if="selectedDraftCustomer?.address || selectedDraftCustomer?.phone" class="sale-meta">
              {{ selectedDraftCustomer?.address || 'No address' }}<span v-if="selectedDraftCustomer?.address && selectedDraftCustomer?.phone"> • </span>{{ selectedDraftCustomer?.phone || '' }}
            </div>
          </div>

          <span class="badge badge-draft">
            DRAFT
          </span>
        </div>

        <div class="table-wrap draft-items-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ catalogEntryLabel }}</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in selectedDraftItems" :key="`${selectedDraft.id}-${item.id}-${item.priceType}`">
                <td>
                  <div class="item-name">{{ item.name }}</div>
                  <div v-if="item.generic_name" class="item-secondary">{{ item.generic_name }}</div>
                  <div class="item-meta">{{ item.priceType || 'regular' }}</div>
                </td>
                <td>{{ item.qty }}</td>
                <td>₱{{ Number(item.price || 0).toFixed(2) }}</td>
                <td>₱{{ (Number(item.price || 0) * Number(item.qty || 0)).toFixed(2) }}</td>
              </tr>
              <tr v-if="!selectedDraftItems.length">
                <td colspan="4" class="empty-state-cell">No {{ catalogLabel.toLowerCase() }} saved in this draft.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sale-summary">
          <div>Subtotal: ₱{{ selectedDraftSubtotal.toFixed(2) }}</div>
          <div>{{ professionalFeeLabel }}: ₱{{ Number(selectedDraft.professionalFee || 0).toFixed(2) }}</div>
          <div>Discount: ₱{{ selectedDraftDiscount.toFixed(2) }}</div>
          <div><strong>Total: ₱{{ selectedDraftGrandTotal.toFixed(2) }}</strong></div>

          <hr />

          <div>Money Given: ₱{{ Number(selectedDraft.moneyGiven || 0).toFixed(2) }}</div>
        </div>

        <div class="modal-actions draft-details-actions">
          <button class="primary btn" @click="resumeDraft(selectedDraft)">▶ Resume Draft</button>
          <button class="secondary btn" @click="closeDetailsModal">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-shell { margin: auto; padding: 20px; overflow-x: hidden; }

h1 { margin-bottom: 16px; }

.empty-state {
  margin-top: 40px;
  text-align: center;
  color: #888;
  font-size: 16px;
}

.actions-td > button { margin: 3px; }

.draft-details-modal {
  margin: 20px 0;
}

.draft-modal-backdrop {
  align-items: flex-start;
}

.sale-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.sale-header h2 {
  margin: 0;
}

.sale-meta {
  margin-top: 4px;
  color: #64748b;
}

.badge-draft {
  background: #eef8f4;
  color: #166a5e;
  border: 1px solid #cfe8de;
}

.draft-items-wrap {
  margin-bottom: 16px;
}

.draft-items-wrap small {
  color: #64748b;
}

.item-name {
  font-weight: 600;
}

.item-secondary {
  font-size: 13px;
  color: #ffff;
}

.item-meta {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  color: #1a8a6e;
}

.sale-summary {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid #dbe6e2;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fffc 100%);
  margin-bottom: 16px;
}

.sale-summary hr {
  width: 100%;
  border: 0;
  border-top: 1px solid #dbe6e2;
  margin: 4px 0;
}

.draft-details-actions {
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .sale-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
