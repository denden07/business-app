<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import SearchInput from '../components/SearchInput.vue'
import Pagination from '../components/Pagination.vue'
import IconActionButton from '../components/IconActionButton.vue'
import Swal from 'sweetalert2'
import { COMMON_BUDGET_CATEGORIES } from '../store/budget'

const store = useStore()

const page = ref(1)
const perPage = ref(10)
const search = ref('')
const categoryFilter = ref('all')
const selectedMonth = ref(currentMonthKey())
const sortBy = ref('expense_date')
const sortOrder = ref('desc')
const expenseCategoryMode = ref('preset')
const budgetCategoryMode = ref('preset')

const expenseDialog = ref(null)
const budgetDialog = ref(null)

const expenses = computed(() => store.state.budget.expenses || [])
const budgets = computed(() => store.state.budget.budgets || [])
const budgetUsage = computed(() => store.state.budget.budgetUsage || [])
const categoryOptions = computed(() => store.state.budget.categoryOptions || [])
const selectableCategoryOptions = computed(() => {
  const categories = new Set([...COMMON_BUDGET_CATEGORIES, ...categoryOptions.value])
  return Array.from(categories).sort((left, right) => left.localeCompare(right))
})
const summary = computed(() => store.state.budget.summary || {})
const loading = computed(() => !!store.state.budget.loading)
const totalPages = computed(() => store.getters['budget/totalPages'])

const selectedMonthLabel = computed(() => {
  const [yearRaw, monthRaw] = String(summary.value.monthKey || selectedMonth.value).split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const date = new Date(year, monthIndex, 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const budgetMap = computed(() => {
  return budgets.value.reduce((map, budget) => {
    map[budget.id] = budget
    return map
  }, {})
})

const expenseForm = ref(createEmptyExpense())
const budgetForm = ref(createEmptyBudget())

async function load() {
  await store.dispatch('budget/loadBudgetPage', {
    page: page.value,
    perPage: perPage.value,
    search: search.value,
    category: categoryFilter.value,
    month: selectedMonth.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  })
}

watch([search, categoryFilter, selectedMonth, perPage, sortBy, sortOrder], () => {
  page.value = 1
  load()
})

watch(page, () => load())

onMounted(load)

function openAddExpense() {
  expenseForm.value = createEmptyExpense({
    category: categoryFilter.value !== 'all' ? categoryFilter.value : 'General',
    expense_date: `${selectedMonth.value}-01`,
  })
  expenseCategoryMode.value = resolveCategoryMode(expenseForm.value.category)
  expenseDialog.value?.showModal()
}

function openEditExpense(expense) {
  expenseForm.value = {
    id: expense.id,
    title: expense.title,
    category: expense.category,
    amount: expense.amount,
    expense_date: formatDateInput(expense.expense_date),
    note: expense.note,
    budget_id: expense.budget_id || '',
  }
  expenseCategoryMode.value = resolveCategoryMode(expense.category)
  expenseDialog.value?.showModal()
}

function closeExpenseDialog() {
  expenseDialog.value?.close()
  expenseForm.value = createEmptyExpense()
  expenseCategoryMode.value = 'preset'
}

async function saveExpense() {
  const amount = Number(expenseForm.value.amount)

  if (!expenseForm.value.title.trim()) {
    await Swal.fire({ icon: 'warning', title: 'Expense name required' })
    return
  }

  if (!expenseForm.value.category.trim()) {
    await Swal.fire({ icon: 'warning', title: 'Category required' })
    return
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    await Swal.fire({ icon: 'warning', title: 'Enter a valid amount' })
    return
  }

  try {
    const isEditing = !!expenseForm.value.id
    const payload = {
      ...expenseForm.value,
      amount,
    }

    if (isEditing) {
      await store.dispatch('budget/updateExpense', payload)
    } else {
      await store.dispatch('budget/addExpense', payload)
    }

    closeExpenseDialog()
    await load()
    await Swal.fire({
      icon: 'success',
      title: isEditing ? 'Expense updated' : 'Expense added',
      timer: 1200,
      showConfirmButton: false,
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: error.message || 'Unable to save this expense.',
    })
  }
}

async function removeExpense(expense) {
  const result = await Swal.fire({
    title: 'Delete expense?',
    text: 'This cannot be undone.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#e74c3c',
  })

  if (!result.isConfirmed) {
    return
  }

  await store.dispatch('budget/deleteExpense', expense.id)
  await load()
  await Swal.fire({ icon: 'success', title: 'Expense deleted', timer: 1200, showConfirmButton: false })
}

function openAddBudget() {
  budgetForm.value = createEmptyBudget({
    category: categoryFilter.value !== 'all' ? categoryFilter.value : 'General',
  })
  budgetCategoryMode.value = resolveCategoryMode(budgetForm.value.category)
  budgetDialog.value?.showModal()
}

function openEditBudget(budget) {
  budgetForm.value = {
    id: budget.id,
    name: budget.name,
    category: budget.category,
    amount_limit: budget.amount_limit,
    is_active: budget.is_active,
  }
  budgetCategoryMode.value = resolveCategoryMode(budget.category)
  budgetDialog.value?.showModal()
}

function closeBudgetDialog() {
  budgetDialog.value?.close()
  budgetForm.value = createEmptyBudget()
  budgetCategoryMode.value = 'preset'
}

async function saveBudget() {
  const amountLimit = Number(budgetForm.value.amount_limit)

  if (!budgetForm.value.name.trim()) {
    await Swal.fire({ icon: 'warning', title: 'Budget name required' })
    return
  }

  if (!budgetForm.value.category.trim()) {
    await Swal.fire({ icon: 'warning', title: 'Category required' })
    return
  }

  if (!Number.isFinite(amountLimit) || amountLimit <= 0) {
    await Swal.fire({ icon: 'warning', title: 'Enter a valid budget amount' })
    return
  }

  try {
    const isEditing = !!budgetForm.value.id
    const payload = {
      ...budgetForm.value,
      amount_limit: amountLimit,
    }

    if (isEditing) {
      await store.dispatch('budget/updateBudget', payload)
    } else {
      await store.dispatch('budget/addBudget', payload)
    }

    closeBudgetDialog()
    await load()
    await Swal.fire({
      icon: 'success',
      title: isEditing ? 'Budget updated' : 'Budget added',
      timer: 1200,
      showConfirmButton: false,
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Save failed',
      text: error.message || 'Unable to save this budget.',
    })
  }
}

async function removeBudget(budget) {
  const result = await Swal.fire({
    title: 'Delete budget bucket?',
    text: 'Existing expenses will remain, but the bucket will be removed.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#e74c3c',
  })

  if (!result.isConfirmed) {
    return
  }

  await store.dispatch('budget/deleteBudget', budget.id)
  await load()
  await Swal.fire({ icon: 'success', title: 'Budget deleted', timer: 1200, showConfirmButton: false })
}

function toggleSort(field) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    return
  }

  sortBy.value = field
  sortOrder.value = field === 'expense_date' ? 'desc' : 'asc'
}

function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateDisplay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateInput(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return currentDateInput()
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveBudgetName(expense) {
  if (expense.budget_id && budgetMap.value[expense.budget_id]) {
    return budgetMap.value[expense.budget_id].name
  }

  const matchingBudget = budgets.value.find(budget => budget.category === expense.category && budget.is_active)
  return matchingBudget?.name || 'Unassigned'
}

function budgetProgressWidth(budget) {
  const percent = Math.max(budget.progressRatio || 0, 0) * 100
  return `${Math.min(percent, 100)}%`
}

function handleExpenseCategoryModeChange(mode) {
  expenseCategoryMode.value = mode

  if (mode === 'custom') {
    expenseForm.value.category = ''
    return
  }

  if (!expenseForm.value.category || !selectableCategoryOptions.value.includes(expenseForm.value.category)) {
    expenseForm.value.category = 'General'
  }
}

function handleBudgetCategoryModeChange(mode) {
  budgetCategoryMode.value = mode

  if (mode === 'custom') {
    budgetForm.value.category = ''
    return
  }

  if (!budgetForm.value.category || !selectableCategoryOptions.value.includes(budgetForm.value.category)) {
    budgetForm.value.category = 'General'
  }
}

function resolveCategoryMode(category) {
  return selectableCategoryOptions.value.includes(category) ? 'preset' : 'custom'
}

function createEmptyExpense(overrides = {}) {
  return {
    id: null,
    title: '',
    category: 'General',
    amount: '',
    expense_date: currentDateInput(),
    note: '',
    budget_id: '',
    ...overrides,
  }
}

function createEmptyBudget(overrides = {}) {
  return {
    id: null,
    name: '',
    category: 'General',
    amount_limit: '',
    is_active: true,
    ...overrides,
  }
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentDateInput() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<template>
  <div class="budget-page">
    <div class="page-header">
      <div>
        <h1>Budget</h1>
        <p class="muted">Track expenses, define monthly spending buckets, and compare spending against budget targets.</p>
      </div>
      <button class="primary" @click="openAddExpense">Add Expense</button>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>Expenses for {{ selectedMonthLabel }}</span>
        <strong>{{ formatCurrency(summary.expenseTotal) }}</strong>
      </div>
      <div class="summary-card">
        <span>Monthly Budget</span>
        <strong>{{ formatCurrency(summary.monthlyBudgetTotal) }}</strong>
      </div>
      <div class="summary-card" :class="{ 'summary-card-negative': Number(summary.remainingBudgetTotal) < 0 }">
        <span>Remaining Budget</span>
        <strong>{{ formatCurrency(summary.remainingBudgetTotal) }}</strong>
      </div>
      <div class="summary-card">
        <span>Over Budget Categories</span>
        <strong>{{ summary.overBudgetCount || 0 }}</strong>
      </div>
    </div>

    <section class="section-card">
      <div class="section-header">
        <div>
          <h2>Monthly Budget Buckets</h2>
          <p class="muted">Create category-based monthly limits so spending stays visible and measurable.</p>
        </div>
        <button class="secondary" @click="openAddBudget">Add Budget Bucket</button>
      </div>

      <div v-if="budgetUsage.length" class="budget-grid">
        <article v-for="budget in budgetUsage" :key="budget.id" class="budget-card" :class="{ over: budget.isOverBudget, inactive: !budget.is_active }">
          <div class="budget-card-top">
            <div>
              <h3>{{ budget.name }}</h3>
              <p>{{ budget.category }}</p>
            </div>
            <span class="budget-status" :class="budget.isOverBudget ? 'over' : 'ok'">
              {{ budget.isOverBudget ? 'Over Budget' : 'On Track' }}
            </span>
          </div>

          <div class="budget-amounts">
            <div>
              <span>Limit</span>
              <strong>{{ formatCurrency(budget.amount_limit) }}</strong>
            </div>
            <div>
              <span>Spent</span>
              <strong>{{ formatCurrency(budget.spent) }}</strong>
            </div>
            <div>
              <span>{{ budget.isOverBudget ? 'Over by' : 'Remaining' }}</span>
              <strong>{{ formatCurrency(Math.abs(budget.remaining)) }}</strong>
            </div>
          </div>

          <div class="budget-progress-track">
            <div class="budget-progress-fill" :class="budget.isOverBudget ? 'over' : 'ok'" :style="{ width: budgetProgressWidth(budget) }"></div>
          </div>

          <div class="budget-actions">
            <button class="warning btn" @click="openEditBudget(budget)">Edit</button>
            <button class="danger btn" @click="removeBudget(budget)">Delete</button>
          </div>
        </article>
      </div>

      <div v-else class="empty-block">
        No budget buckets yet. Add your first monthly budget to start comparing expenses against targets.
      </div>
    </section>

    <section class="section-card">
      <div class="section-header">
        <div>
          <h2>Expense Ledger</h2>
          <p class="muted">Review all recorded expenses for the selected month.</p>
        </div>
      </div>

      <div class="toolbar">
        <SearchInput v-model="search" placeholder="Search expense, category, or note..." />

        <select v-model="categoryFilter" class="select-field">
          <option value="all">All Categories</option>
          <option v-for="category in categoryOptions" :key="category" :value="category">
            {{ category }}
          </option>
        </select>

        <input v-model="selectedMonth" class="month-field" type="month" />

        <div class="items-per-page">
          <label>Rows:</label>
          <select v-model.number="perPage" class="select-field compact">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th @click="toggleSort('expense_date')">Date<span v-if="sortBy === 'expense_date'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span></th>
              <th @click="toggleSort('title')">Expense<span v-if="sortBy === 'title'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span></th>
              <th @click="toggleSort('category')">Category<span v-if="sortBy === 'category'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span></th>
              <th @click="toggleSort('amount')">Amount<span v-if="sortBy === 'amount'">{{ sortOrder === 'asc' ? ' ↑' : ' ↓' }}</span></th>
              <th>Budget Bucket</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="expense in expenses" :key="expense.id">
              <td>{{ formatDateDisplay(expense.expense_date) }}</td>
              <td>{{ expense.title }}</td>
              <td>{{ expense.category }}</td>
              <td class="amount-cell">{{ formatCurrency(expense.amount) }}</td>
              <td>{{ resolveBudgetName(expense) }}</td>
              <td class="note-cell">{{ expense.note || '—' }}</td>
              <td class="actions-cell">
                <IconActionButton icon="edit" label="Edit expense" variant="warning" @click="openEditExpense(expense)" />
                <IconActionButton icon="delete" label="Delete expense" variant="danger" @click="removeExpense(expense)" />
              </td>
            </tr>
            <tr v-if="!expenses.length && !loading">
              <td colspan="7" class="empty-cell">No expenses found for this month.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="empty-cell">Loading expenses...</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination v-model:page="page" :total-pages="totalPages" :max-pages="5" />
    </section>

    <dialog ref="expenseDialog" class="form-dialog">
      <form method="dialog" class="dialog-form" @submit.prevent="saveExpense">
        <div class="dialog-header">
          <h3>{{ expenseForm.id ? 'Edit Expense' : 'Add Expense' }}</h3>
          <button type="button" class="icon-close" @click="closeExpenseDialog">✕</button>
        </div>

        <label>
          <span>Expense name</span>
          <input v-model="expenseForm.title" class="input" type="text" maxlength="80" placeholder="Electricity bill" />
        </label>

        <label>
          <span>Category Type</span>
          <select :value="expenseCategoryMode" class="input" @change="handleExpenseCategoryModeChange($event.target.value)">
            <option value="preset">Choose from common categories</option>
            <option value="custom">Add custom category</option>
          </select>
        </label>

        <label v-if="expenseCategoryMode === 'preset'">
          <span>Category</span>
          <select v-model="expenseForm.category" class="input">
            <option v-for="category in selectableCategoryOptions" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>

        <label v-else>
          <span>Custom category</span>
          <input v-model="expenseForm.category" class="input" type="text" list="budget-categories" maxlength="40" placeholder="Utilities" />
        </label>

        <label>
          <span>Amount</span>
          <input v-model.number="expenseForm.amount" class="input" type="number" min="0.01" step="0.01" placeholder="0.00" />
        </label>

        <label>
          <span>Date</span>
          <input v-model="expenseForm.expense_date" class="input" type="date" />
        </label>

        <label>
          <span>Budget bucket</span>
          <select v-model="expenseForm.budget_id" class="input">
            <option value="">No bucket</option>
            <option v-for="budget in budgets" :key="budget.id" :value="budget.id">{{ budget.name }} ({{ budget.category }})</option>
          </select>
        </label>

        <label>
          <span>Note</span>
          <textarea v-model="expenseForm.note" class="input textarea" rows="3" placeholder="Optional note"></textarea>
        </label>

        <div class="dialog-actions">
          <button type="button" class="secondary" @click="closeExpenseDialog">Cancel</button>
          <button type="submit" class="primary">Save Expense</button>
        </div>
      </form>
    </dialog>

    <dialog ref="budgetDialog" class="form-dialog">
      <form method="dialog" class="dialog-form" @submit.prevent="saveBudget">
        <div class="dialog-header">
          <h3>{{ budgetForm.id ? 'Edit Budget Bucket' : 'Add Budget Bucket' }}</h3>
          <button type="button" class="icon-close" @click="closeBudgetDialog">✕</button>
        </div>

        <label>
          <span>Bucket name</span>
          <input v-model="budgetForm.name" class="input" type="text" maxlength="80" placeholder="Utilities Budget" />
        </label>

        <label>
          <span>Category Type</span>
          <select :value="budgetCategoryMode" class="input" @change="handleBudgetCategoryModeChange($event.target.value)">
            <option value="preset">Choose from common categories</option>
            <option value="custom">Add custom category</option>
          </select>
        </label>

        <label v-if="budgetCategoryMode === 'preset'">
          <span>Category</span>
          <select v-model="budgetForm.category" class="input">
            <option v-for="category in selectableCategoryOptions" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>

        <label v-else>
          <span>Custom category</span>
          <input v-model="budgetForm.category" class="input" type="text" list="budget-categories" maxlength="40" placeholder="Utilities" />
        </label>

        <label>
          <span>Monthly limit</span>
          <input v-model.number="budgetForm.amount_limit" class="input" type="number" min="0.01" step="0.01" placeholder="0.00" />
        </label>

        <label class="checkbox-row">
          <input v-model="budgetForm.is_active" type="checkbox" />
          <span>Active</span>
        </label>

        <div class="dialog-actions">
          <button type="button" class="secondary" @click="closeBudgetDialog">Cancel</button>
          <button type="submit" class="primary">Save Budget</button>
        </div>
      </form>
    </dialog>

    <datalist id="budget-categories">
      <option v-for="category in selectableCategoryOptions" :key="category" :value="category"></option>
    </datalist>
  </div>
</template>

<style scoped>
.budget-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
}

.page-header,
.section-header,
.toolbar,
.budget-card-top,
.budget-actions,
.dialog-header,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-header,
.section-header {
  align-items: flex-start;
}

.page-header h1,
.section-header h2,
.dialog-header h3,
.budget-card h3 {
  margin: 0;
  color: #0f172a;
}

.page-header p,
.section-header p,
.budget-card p {
  margin: 6px 0 0;
}

.muted {
  color: #64748b;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.summary-card,
.section-card,
.budget-card {
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.07);
}

.summary-card {
  padding: 18px;
  display: grid;
  gap: 8px;
}

.summary-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-card strong {
  color: #0f172a;
  font-size: 28px;
  line-height: 1.1;
}

.summary-card-negative strong {
  color: #dc2626;
}

.section-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.budget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.budget-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.budget-card.inactive {
  opacity: 0.7;
}

.budget-status {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.budget-status.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.budget-status.over {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.budget-amounts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.budget-amounts div {
  display: grid;
  gap: 4px;
}

.budget-amounts span {
  font-size: 12px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.budget-amounts strong {
  color: #0f172a;
}

.budget-progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.budget-progress-fill {
  height: 100%;
  border-radius: inherit;
}

.budget-progress-fill.ok {
  background: linear-gradient(90deg, #10b981, #0ea5e9);
}

.budget-progress-fill.over {
  background: linear-gradient(90deg, #f97316, #ef4444);
}

.empty-block,
.empty-cell {
  padding: 18px;
  border-radius: 14px;
  color: #64748b;
  text-align: center;
}

.toolbar {
  flex-wrap: wrap;
}

.month-field,
.select-field.compact {
  min-height: 42px;
}

.items-per-page {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  text-align: left;
  vertical-align: top;
}

th {
  color: #334155;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.amount-cell {
  font-weight: 700;
  color: #0f172a;
}

.note-cell {
  max-width: 260px;
  color: #475569;
}

.actions-cell {
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.form-dialog {
  width: min(100%, 520px);
  border: none;
  border-radius: 18px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
}

.form-dialog::backdrop {
  background: rgba(15, 23, 42, 0.5);
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: #ffffff;
}

.dialog-form label {
  display: grid;
  gap: 8px;
}

.dialog-form span {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.textarea {
  resize: vertical;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.checkbox-row span {
  margin: 0;
}

.icon-close {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 18px;
  padding: 0;
  width: 32px;
  height: 32px;
}

body.dark-mode .page-header h1,
body.dark-mode .section-header h2,
body.dark-mode .dialog-header h3,
body.dark-mode .budget-card h3,
body.dark-mode .summary-card strong,
body.dark-mode .budget-amounts strong,
body.dark-mode .amount-cell {
  color: #f8fafc;
}

body.dark-mode .muted,
body.dark-mode .summary-card span,
body.dark-mode .budget-amounts span,
body.dark-mode .note-cell,
body.dark-mode th,
body.dark-mode .dialog-form span,
body.dark-mode .icon-close {
  color: #cbd5e1;
}

body.dark-mode .summary-card,
body.dark-mode .section-card,
body.dark-mode .budget-card,
body.dark-mode .dialog-form {
  background: linear-gradient(180deg, #36404a 0%, #313b45 100%);
  border-color: #536170;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
}

body.dark-mode .budget-status.ok {
  background: rgba(110, 231, 183, 0.22);
  color: #d1fae5;
}

body.dark-mode .budget-status.over {
  background: rgba(252, 165, 165, 0.22);
  color: #fee2e2;
}

body.dark-mode .summary-card-negative strong {
  color: #fca5a5;
}

body.dark-mode .budget-progress-track {
  background: rgba(148, 163, 184, 0.2);
}

body.dark-mode th,
body.dark-mode td {
  border-bottom-color: rgba(148, 163, 184, 0.2);
}

@media (max-width: 768px) {
  .budget-page {
    padding: 16px;
  }

  .page-header,
  .section-header,
  .toolbar,
  .budget-card-top,
  .dialog-header,
  .dialog-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .budget-amounts {
    grid-template-columns: 1fr;
  }

  .actions-cell {
    display: grid;
    gap: 8px;
  }
}
</style>