import { dbPromise } from '../db'

export const COMMON_BUDGET_CATEGORIES = Object.freeze([
  'General',
  'Rent',
  'Utilities',
  'Payroll',
  'Inventory',
  'Supplies',
  'Transportation',
  'Marketing',
  'Maintenance',
  'Taxes',
  'Equipment',
  'Internet',
  'Cleaning',
  'Permits',
  'Miscellaneous',
])

export default {
  namespaced: true,

  state: () => ({
    expenses: [],
    budgets: [],
    budgetUsage: [],
    categoryOptions: [],
    summary: {
      expenseTotal: 0,
      monthlyBudgetTotal: 0,
      remainingBudgetTotal: 0,
      overBudgetCount: 0,
      monthKey: currentMonthKey(),
    },
    currentPage: 1,
    itemsPerPage: 10,
    totalCount: 0,
    loading: false,
  }),

  getters: {
    totalPages: state => Math.max(1, Math.ceil(state.totalCount / state.itemsPerPage)),
  },

  mutations: {
    SET_EXPENSES(state, expenses) {
      state.expenses = expenses
    },
    SET_BUDGETS(state, budgets) {
      state.budgets = budgets
    },
    SET_BUDGET_USAGE(state, usage) {
      state.budgetUsage = usage
    },
    SET_CATEGORY_OPTIONS(state, options) {
      state.categoryOptions = options
    },
    SET_SUMMARY(state, summary) {
      state.summary = summary
    },
    SET_CURRENT_PAGE(state, page) {
      state.currentPage = page
    },
    SET_ITEMS_PER_PAGE(state, value) {
      state.itemsPerPage = value
    },
    SET_TOTAL_COUNT(state, count) {
      state.totalCount = count
    },
    SET_LOADING(state, value) {
      state.loading = value
    },
  },

  actions: {
    async loadBudgetPage(
      { commit },
      {
        page = 1,
        perPage = 10,
        search = '',
        category = 'all',
        month = currentMonthKey(),
        sortBy = 'expense_date',
        sortOrder = 'desc',
      } = {}
    ) {
      commit('SET_LOADING', true)

      try {
        const db = await dbPromise
        const [allExpenses, allBudgets] = await Promise.all([
          db.getAll('expenses'),
          db.getAll('expense_budgets'),
        ])

        const normalizedExpenses = allExpenses.map(normalizeExpenseRecord)
        const normalizedBudgets = allBudgets
          .map(normalizeBudgetRecord)
          .sort((left, right) => {
            if (left.is_active !== right.is_active) {
              return left.is_active ? -1 : 1
            }

            const nameCompare = left.name.localeCompare(right.name)
            if (nameCompare !== 0) {
              return nameCompare
            }

            return left.id - right.id
          })

        const normalizedMonth = normalizeMonthKey(month)
        const { start: monthStart, end: monthEnd } = getMonthRange(normalizedMonth)
        const monthExpenses = normalizedExpenses.filter(expense => isDateWithinRange(expense.expense_date, monthStart, monthEnd))
        const budgetUsage = buildBudgetUsage(normalizedBudgets, monthExpenses)
        const monthlyBudgetTotal = budgetUsage.reduce((sum, budget) => sum + budget.amount_limit, 0)
        const expenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)

        const normalizedSearch = String(search || '').trim().toLowerCase()
        const normalizedCategory = normalizeCategoryFilter(category)

        const filteredExpenses = normalizedExpenses.filter(expense => {
          if (!isDateWithinRange(expense.expense_date, monthStart, monthEnd)) {
            return false
          }

          if (normalizedCategory !== 'all' && expense.category !== normalizedCategory) {
            return false
          }

          if (!normalizedSearch) {
            return true
          }

          return [expense.title, expense.category, expense.note]
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        })

        sortExpenses(filteredExpenses, sortBy, sortOrder)

        const offset = (page - 1) * perPage
        const pageExpenses = filteredExpenses.slice(offset, offset + perPage)

        commit('SET_EXPENSES', pageExpenses)
        commit('SET_BUDGETS', normalizedBudgets)
        commit('SET_BUDGET_USAGE', budgetUsage)
        commit('SET_CATEGORY_OPTIONS', buildCategoryOptions(normalizedExpenses, normalizedBudgets))
        commit('SET_SUMMARY', {
          expenseTotal,
          monthlyBudgetTotal,
          remainingBudgetTotal: monthlyBudgetTotal - expenseTotal,
          overBudgetCount: budgetUsage.filter(budget => budget.isOverBudget).length,
          monthKey: normalizedMonth,
        })
        commit('SET_CURRENT_PAGE', page)
        commit('SET_ITEMS_PER_PAGE', perPage)
        commit('SET_TOTAL_COUNT', filteredExpenses.length)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async addExpense(_, expense) {
      const db = await dbPromise
      const now = new Date().toISOString()
      return db.add('expenses', {
        ...normalizeExpensePayload(expense),
        created_at: now,
        updated_at: now,
      })
    },

    async updateExpense(_, expense) {
      const db = await dbPromise
      const current = await db.get('expenses', expense.id)
      if (!current) {
        throw new Error('Expense record not found.')
      }

      await db.put('expenses', {
        ...current,
        ...normalizeExpensePayload(expense),
        updated_at: new Date().toISOString(),
      })
    },

    async deleteExpense(_, expenseId) {
      const db = await dbPromise
      await db.delete('expenses', expenseId)
    },

    async addBudget(_, budget) {
      const db = await dbPromise
      const now = new Date().toISOString()
      return db.add('expense_budgets', {
        ...normalizeBudgetPayload(budget),
        created_at: now,
        updated_at: now,
      })
    },

    async updateBudget(_, budget) {
      const db = await dbPromise
      const current = await db.get('expense_budgets', budget.id)
      if (!current) {
        throw new Error('Budget bucket not found.')
      }

      await db.put('expense_budgets', {
        ...current,
        ...normalizeBudgetPayload(budget),
        updated_at: new Date().toISOString(),
      })
    },

    async deleteBudget(_, budgetId) {
      const db = await dbPromise
      await db.delete('expense_budgets', budgetId)
    },
  },
}

function normalizeExpensePayload(expense = {}) {
  const budgetId = Number(expense.budget_id)

  return {
    title: String(expense.title || '').trim(),
    category: normalizeCategoryValue(expense.category),
    amount: normalizePositiveNumber(expense.amount),
    expense_date: normalizeExpenseDate(expense.expense_date),
    note: String(expense.note || '').trim(),
    budget_id: Number.isFinite(budgetId) && budgetId > 0 ? budgetId : null,
  }
}

function normalizeBudgetPayload(budget = {}) {
  return {
    name: String(budget.name || '').trim(),
    category: normalizeCategoryValue(budget.category),
    amount_limit: normalizePositiveNumber(budget.amount_limit),
    period: 'monthly',
    is_active: budget.is_active !== false,
  }
}

function normalizeExpenseRecord(expense = {}) {
  return {
    id: Number(expense.id),
    title: String(expense.title || '').trim() || 'Untitled expense',
    category: normalizeCategoryValue(expense.category),
    amount: normalizePositiveNumber(expense.amount),
    expense_date: normalizeExpenseDate(expense.expense_date || expense.created_at),
    note: String(expense.note || '').trim(),
    budget_id: Number.isFinite(Number(expense.budget_id)) ? Number(expense.budget_id) : null,
    created_at: expense.created_at || null,
    updated_at: expense.updated_at || null,
  }
}

function normalizeBudgetRecord(budget = {}) {
  return {
    id: Number(budget.id),
    name: String(budget.name || '').trim() || normalizeCategoryValue(budget.category),
    category: normalizeCategoryValue(budget.category),
    amount_limit: normalizePositiveNumber(budget.amount_limit),
    period: budget.period || 'monthly',
    is_active: budget.is_active !== false,
    created_at: budget.created_at || null,
    updated_at: budget.updated_at || null,
  }
}

function buildBudgetUsage(budgets = [], monthExpenses = []) {
  return budgets.map(budget => {
    const spent = monthExpenses.reduce((sum, expense) => {
      const matchesAssignedBudget = Number(expense.budget_id) === Number(budget.id)
      const matchesCategoryFallback = !expense.budget_id && expense.category === budget.category

      return matchesAssignedBudget || matchesCategoryFallback
        ? sum + expense.amount
        : sum
    }, 0)
    const remaining = budget.amount_limit - spent
    const progressRatio = budget.amount_limit > 0 ? spent / budget.amount_limit : 0

    return {
      ...budget,
      spent,
      remaining,
      progressRatio,
      isOverBudget: remaining < 0,
    }
  })
}

function buildCategoryOptions(expenses = [], budgets = []) {
  const categories = new Set(COMMON_BUDGET_CATEGORIES)

  for (const entry of expenses) {
    categories.add(normalizeCategoryValue(entry.category))
  }

  for (const entry of budgets) {
    categories.add(normalizeCategoryValue(entry.category))
  }

  return Array.from(categories).sort((left, right) => left.localeCompare(right))
}

function sortExpenses(expenses = [], sortBy = 'expense_date', sortOrder = 'desc') {
  expenses.sort((left, right) => {
    let comparison = 0

    if (sortBy === 'amount') {
      comparison = left.amount - right.amount
    } else if (sortBy === 'category') {
      comparison = left.category.localeCompare(right.category)
    } else if (sortBy === 'title') {
      comparison = left.title.localeCompare(right.title)
    } else {
      comparison = new Date(left.expense_date).getTime() - new Date(right.expense_date).getTime()
    }

    if (comparison === 0) {
      comparison = left.id - right.id
    }

    return sortOrder === 'asc' ? comparison : comparison * -1
  })
}

function normalizePositiveNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function normalizeCategoryValue(value) {
  const normalized = String(value || '').trim()
  return normalized || 'General'
}

function normalizeCategoryFilter(value) {
  const normalized = String(value || 'all').trim()
  return normalized || 'all'
}

function normalizeExpenseDate(value) {
  if (!value) {
    return new Date().toISOString()
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  const normalizedString = String(value).trim()
  const dateOnlyMatch = normalizedString.match(/^\d{4}-\d{2}-\d{2}$/)
  const parsedDate = dateOnlyMatch
    ? new Date(`${normalizedString}T12:00:00`)
    : new Date(normalizedString)

  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString()
}

function isDateWithinRange(value, start, end) {
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) {
    return false
  }

  return target >= start && target <= end
}

function getMonthRange(monthKey) {
  const [yearRaw, monthRaw] = String(monthKey || currentMonthKey()).split('-')
  const year = Number(yearRaw)
  const monthIndex = Math.max(Number(monthRaw) - 1, 0)
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

function normalizeMonthKey(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : currentMonthKey()
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}