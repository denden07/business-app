<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useStore } from 'vuex'
import { dbPromise } from '../db'
import MetricCard from '../components/analytics/MetricCard.vue'
import VueApexCharts from 'vue3-apexcharts'
import { format } from 'date-fns'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { getLocalDayEnd, getLocalDayStart } from '../utils/dateRange'
import { getSaleAmountPaid, getSaleOutstandingBalance } from '../utils/saleStatus'
import {
  getTemplateCatalogLabel,
  getTemplateCatalogEntryLabel,
  getTemplateDailySalesQuota,
} from '../utils/templatePresentation'

const store = useStore()

// --------------------
// Metrics
// --------------------
const totalSales = ref(0)
const totalExpenses = ref(0)
const totalProfit = ref(0)
const upfrontCollected = ref(0)
const debtPaymentsCollected = ref(0)
const totalCashCollected = ref(0)
const receivablesCreated = ref(0)
const outstandingReceivables = ref(0)
const totalItems = ref(0)
const voidedSalesCount = ref(0)
const totalTransactions = ref(0)
const totalProductUnits = ref(0)
const totalServiceUnits = ref(0)
const lowStockCount = ref(0)

// --------------------
// Charts
// --------------------
const salesTrendOptions = ref({})
const salesTrendSeries = ref([])
const financeTrendOptions = ref({})
const financeTrendSeries = ref([])
const debtTrendOptions = ref({})
const debtTrendSeries = ref([])
const topItemsOptions = ref({})
const topItemsSeries = ref([])
const topProductsOptions = ref({})
const topProductsSeries = ref([])
const topServicesOptions = ref({})
const topServicesSeries = ref([])
const calendarOptions = ref({})
const calendarSeries = ref([])

const isLoading = ref(false)
const activeTemplate = computed(() => store.getters['template/activeTemplate'] || {})
const reportingFocus = computed(() => store.getters['template/reportingFocus'] || activeTemplate.value.reporting?.focus || 'mixed')
const canSellProducts = computed(() => activeTemplate.value.workflow?.allowProductSales !== false && activeTemplate.value.capabilities?.products !== false)
const canSellServices = computed(() => activeTemplate.value.workflow?.allowServiceSales !== false && activeTemplate.value.capabilities?.services !== false)
const showProductChart = computed(() => activeTemplate.value.reporting?.showProductChart !== false && canSellProducts.value)
const showServiceChart = computed(() => activeTemplate.value.reporting?.showServiceChart !== false && canSellServices.value)
const templateLabels = computed(() => activeTemplate.value.labels || {})
const catalogLabel = computed(() => getTemplateCatalogLabel(templateLabels.value))
const catalogEntryLabel = computed(() => getTemplateCatalogEntryLabel(templateLabels.value))
const dailySalesQuota = computed(() => getTemplateDailySalesQuota(activeTemplate.value))
const quotaCalendarTitle = computed(() => `Sales Quota Calendar (₱${dailySalesQuota.value.toLocaleString()}/day)`)

// --------------------
// Date Range & Labels
// --------------------
const timeRange = ref('today')
const customStart = ref(null)
const customEnd = ref(null)
const dateRange = ref(null)
const isDark = ref(localStorage.getItem('darkMode') === 'true')

watch(dateRange, (range) => {
  if (range && range[0] && range[1]) {
    customStart.value = range[0]
    customEnd.value = range[1]
  } else {
    customStart.value = null
    customEnd.value = null
  }
})

const salesLabel = computed(() => {
  switch (timeRange.value) {
    case 'today': return 'Gross Sales Today'
    case 'week': return 'Gross Sales This Week'
    case 'month': return 'Gross Sales This Month'
    case 'year': return 'Gross Sales This Year'
    case 'custom': return 'Gross Sales (Custom Range)'
    default: return 'Gross Sales'
  }
})

const cashCollectedLabel = computed(() => buildTimeRangeLabel('Cash Collected'))
const expensesLabel = computed(() => buildTimeRangeLabel('Expenses'))
const profitLabel = computed(() => buildTimeRangeLabel('Net Profit'))
const debtPaymentsLabel = computed(() => buildTimeRangeLabel('Debt Payments Collected'))
const receivablesCreatedLabel = computed(() => buildTimeRangeLabel('Receivables Created'))
const outstandingReceivablesLabel = computed(() => {
  switch (timeRange.value) {
    case 'today': return 'Outstanding Receivables (End of Today)'
    case 'week': return 'Outstanding Receivables (End of Week)'
    case 'month': return 'Outstanding Receivables (End of Month)'
    case 'year': return 'Outstanding Receivables (End of Year)'
    case 'custom': return 'Outstanding Receivables (End of Range)'
    default: return 'Outstanding Receivables'
  }
})

const itemsLabel = computed(() => {
  switch (timeRange.value) {
    case 'today': return 'Items Sold Today'
    case 'week': return 'Items Sold This Week'
    case 'month': return 'Items Sold This Month'
    case 'year': return 'Items Sold This Year'
    case 'custom': return 'Items Sold (Custom Range)'
    default: return 'Items Sold'
  }
})

function buildTimeRangeLabel(prefix) {
  switch (timeRange.value) {
    case 'today': return `${prefix} Today`
    case 'week': return `${prefix} This Week`
    case 'month': return `${prefix} This Month`
    case 'year': return `${prefix} This Year`
    case 'custom': return `${prefix} (Custom Range)`
    default: return prefix
  }
}

const secondaryMetric = computed(() => {
  switch (reportingFocus.value) {
    case 'inventory':
      return {
        title: buildTimeRangeLabel('Product Units Moved'),
        value: totalProductUnits.value,
        type: 'number',
      }
    case 'services':
      return {
        title: buildTimeRangeLabel('Services Sold'),
        value: totalServiceUnits.value,
        type: 'number',
      }
    case 'sales':
      return {
        title: buildTimeRangeLabel('Transactions'),
        value: totalTransactions.value,
        type: 'number',
      }
    default:
      return {
        title: itemsLabel.value,
        value: totalItems.value,
        type: 'number',
      }
  }
})

const tertiaryMetric = computed(() => {
  switch (reportingFocus.value) {
    case 'inventory':
      return {
        title: 'Low Stock Items',
        value: lowStockCount.value,
        type: 'number',
      }
    case 'services':
      return {
        title: buildTimeRangeLabel('Transactions'),
        value: totalTransactions.value,
        type: 'number',
      }
    default:
      return {
        title: 'Voided Sales',
        value: voidedSalesCount.value,
        type: 'number',
      }
  }
})

const metricCards = computed(() => {
  const cards = [
    { title: salesLabel.value, value: totalSales.value, type: 'currency' },
    { title: expensesLabel.value, value: totalExpenses.value, type: 'currency' },
    { title: profitLabel.value, value: totalProfit.value, type: 'currency' },
    { title: cashCollectedLabel.value, value: totalCashCollected.value, type: 'currency' },
    { title: receivablesCreatedLabel.value, value: receivablesCreated.value, type: 'currency' },
    { title: debtPaymentsLabel.value, value: debtPaymentsCollected.value, type: 'currency' },
    { title: outstandingReceivablesLabel.value, value: outstandingReceivables.value, type: 'currency' },
    { title: secondaryMetric.value.title, value: secondaryMetric.value.value, type: secondaryMetric.value.type },
  ]

  if (reportingFocus.value === 'services' && canSellProducts.value) {
    cards.push({
      title: buildTimeRangeLabel('Product Units Sold'),
      value: totalProductUnits.value,
      type: 'number',
    })
  }

  cards.push({ title: tertiaryMetric.value.title, value: tertiaryMetric.value.value, type: tertiaryMetric.value.type })
  return cards
})

const topChartTitle = computed(() => {
  return reportingFocus.value === 'inventory' ? 'Top Products' :
         reportingFocus.value === 'services' ? 'Top Services' :
         `Top ${catalogLabel.value}`
})

const topChartSeriesName = computed(() => {
  return reportingFocus.value === 'services' ? 'Services Sold' :
         reportingFocus.value === 'inventory' ? 'Units Sold' :
         `Quantity Sold per ${catalogEntryLabel.value}`
})

const showMixedTopCharts = computed(() => reportingFocus.value === 'mixed')

// --------------------
// Date Helpers
// --------------------
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
const startOfWeek = (date) => {
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), diff))
}
const startOfMonth = (date) => startOfDay(new Date(date.getFullYear(), date.getMonth(), 1))
const startOfYear = (date) => startOfDay(new Date(date.getFullYear(), 0, 1))

const getStartDate = () => {
  const now = new Date()
  switch (timeRange.value) {
    case 'today': return startOfDay(now)
    case 'week': return startOfWeek(now)
    case 'month': return startOfMonth(now)
    case 'year': return startOfYear(now)
    case 'custom': return customStart.value ? getLocalDayStart(customStart.value) : startOfDay(now)
    default: return startOfDay(now)
  }
}

const getEndDate = () => {
  const now = new Date()
  switch (timeRange.value) {
    case 'today': return endOfDay(now)
    case 'week': return endOfDay(new Date(getStartDate().getTime() + 6*24*60*60*1000)) // week
    case 'month': return endOfDay(new Date(getStartDate().getFullYear(), getStartDate().getMonth() + 1, 0)) // end of month
    case 'year': return endOfDay(new Date(getStartDate().getFullYear(), 11, 31)) // end of year
    case 'custom': return customEnd.value ? getLocalDayEnd(customEnd.value) : endOfDay(now)
    default: return endOfDay(now)
  }
}

// --------------------
// Build Charts & Metrics
// --------------------
const updateCharts = async () => {
  isLoading.value = true
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 300))
  const analyticsCardText = isDark.value ? '#f8fafc' : '#0f172a'
  const analyticsMutedText = isDark.value ? '#cbd5e1' : '#64748b'
  const analyticsGridColor = isDark.value ? '#475569' : '#d9e2ec'
  const startDate = getStartDate()
  const endDate = getEndDate()
  const db = await dbPromise
  const [sales, saleItems, items, debtPayments, expenses] = await Promise.all([
    db.getAll('sales'),
    db.getAll('sale_items'),
    db.getAll('items'),
    db.getAll('debt_payments'),
    db.getAll('expenses'),
  ])
  const includedSaleIds = new Set()
  const grossSalesMap = new Map()
  const expenseTotalsMap = new Map()
  const upfrontCollectedMap = new Map()
  const receivablesCreatedMap = new Map()
  const debtPaymentsMap = new Map()
  const itemsMap = new Map(items.map(item => [item.id, item]))
  const legacyItemIds = new Map(
    items
      .filter(item => item.legacy_medicine_id !== undefined && item.legacy_medicine_id !== null)
      .map(item => [Number(item.legacy_medicine_id), item.id])
  )
  const debtPaymentsBySale = new Map()

  debtPaymentsCollected.value = 0

  for (const payment of debtPayments) {
    const saleId = Number(payment.sale_id)
    if (!Number.isFinite(saleId)) continue

    const amount = Math.max(Number(payment.amount || 0), 0)
    const paidAt = new Date(payment.paid_at || payment.created_at || new Date().toISOString())
    const existing = debtPaymentsBySale.get(saleId) || { total: 0, afterPeriodEnd: 0 }

    existing.total += amount
    if (paidAt > endDate) {
      existing.afterPeriodEnd += amount
    }
    debtPaymentsBySale.set(saleId, existing)

    if (paidAt < startDate || paidAt > endDate) continue

    debtPaymentsCollected.value += amount
    const dayKey = format(paidAt, 'yyyy-MM-dd')
    debtPaymentsMap.set(dayKey, (debtPaymentsMap.get(dayKey) || 0) + amount)
  }

  totalSales.value = 0
  totalExpenses.value = 0
  totalProfit.value = 0
  upfrontCollected.value = 0
  receivablesCreated.value = 0
  outstandingReceivables.value = 0
  totalCashCollected.value = 0
  totalItems.value = 0
  voidedSalesCount.value = 0
  totalTransactions.value = 0
  totalProductUnits.value = 0
  totalServiceUnits.value = 0
  lowStockCount.value = 0
  for (const item of items) {
    if (item.track_stock === false) {
      continue
    }

    const quantity = Number(item.quantity || 0)
    if (quantity > 0 && quantity < 10) {
      lowStockCount.value += 1
    }
  }

  for (const sale of sales) {
    const saleDate = new Date(sale.purchased_date || sale.date)
    if (sale.status === 'voided') {
      if (saleDate >= startDate && saleDate <= endDate) {
        voidedSalesCount.value += 1
      }
      continue
    }

    const saleTotal = Math.max(Number(sale.final_total || 0), 0)
    const currentAmountPaid = getSaleAmountPaid(sale)
    const currentOutstandingBalance = getSaleOutstandingBalance(sale)
    const debtStats = debtPaymentsBySale.get(Number(sale.id)) || { total: 0, afterPeriodEnd: 0 }
    const initialAmountPaid = Math.min(Math.max(currentAmountPaid - debtStats.total, 0), saleTotal)
    const saleReceivablesCreated = Math.max(saleTotal - initialAmountPaid, 0)
    const outstandingAtPeriodEnd = Math.max(currentOutstandingBalance + debtStats.afterPeriodEnd, 0)

    if (saleDate <= endDate) {
      outstandingReceivables.value += outstandingAtPeriodEnd
    }

    if (saleDate < startDate || saleDate > endDate) continue

    includedSaleIds.add(sale.id)
    totalTransactions.value += 1
    totalSales.value += saleTotal
    upfrontCollected.value += initialAmountPaid
    receivablesCreated.value += saleReceivablesCreated

    const dayKey = format(saleDate, 'yyyy-MM-dd')
    grossSalesMap.set(dayKey, (grossSalesMap.get(dayKey) || 0) + saleTotal)
    upfrontCollectedMap.set(dayKey, (upfrontCollectedMap.get(dayKey) || 0) + initialAmountPaid)
    receivablesCreatedMap.set(dayKey, (receivablesCreatedMap.get(dayKey) || 0) + saleReceivablesCreated)
  }

  for (const expense of expenses) {
    const expenseDate = new Date(expense.expense_date || expense.created_at)
    if (Number.isNaN(expenseDate.getTime())) continue
    if (expenseDate < startDate || expenseDate > endDate) continue

    const amount = Math.max(Number(expense.amount || 0), 0)
    totalExpenses.value += amount

    const dayKey = format(expenseDate, 'yyyy-MM-dd')
    expenseTotalsMap.set(dayKey, (expenseTotalsMap.get(dayKey) || 0) + amount)
  }

  totalCashCollected.value = upfrontCollected.value + debtPaymentsCollected.value
  totalProfit.value = totalSales.value - totalExpenses.value

  const itemTotals = new Map()
  for (const item of saleItems) {
    if (!includedSaleIds.has(item.sale_id)) continue

    const quantity = Number(item.quantity || 0)
    totalItems.value += quantity
    const itemId = Number(item.item_id || legacyItemIds.get(Number(item.medicine_id)))
    if (!Number.isFinite(itemId)) continue

    const source = itemsMap.get(itemId)
    const itemType = source?.item_type === 'service' ? 'service' : 'product'

    if (itemType === 'service') {
      totalServiceUnits.value += quantity
    } else {
      totalProductUnits.value += quantity
    }

    const sourceKey = `item:${itemId}`
    itemTotals.set(
      sourceKey,
      (itemTotals.get(sourceKey) || 0) + quantity
    )
  }

  // --------------------
  // Sales Trend
  // --------------------
  const dayCount = Math.ceil((endDate - startDate) / (1000*60*60*24)) + 1
  const grossTrendMap = {}
  const expenseTrendMap = {}
  const profitTrendMap = {}
  const cashCollectedTrendMap = {}
  const receivablesTrendMap = {}
  const debtSettlementTrendMap = {}
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const label = format(d, 'MM/dd')
    grossTrendMap[label] = 0
    expenseTrendMap[label] = 0
    profitTrendMap[label] = 0
    cashCollectedTrendMap[label] = 0
    receivablesTrendMap[label] = 0
    debtSettlementTrendMap[label] = 0
  }

  const mergeDailyMap = (sourceMap, targetMap) => {
    sourceMap.forEach((value, key) => {
      const labelDate = getLocalDayStart(key)
      if (!labelDate) return

      const label = format(labelDate, 'MM/dd')
      if (targetMap[label] !== undefined) {
        targetMap[label] += value
      }
    })
  }

  mergeDailyMap(grossSalesMap, grossTrendMap)
  mergeDailyMap(expenseTotalsMap, expenseTrendMap)
  mergeDailyMap(upfrontCollectedMap, cashCollectedTrendMap)
  mergeDailyMap(receivablesCreatedMap, receivablesTrendMap)
  mergeDailyMap(debtPaymentsMap, debtSettlementTrendMap)

  Object.keys(profitTrendMap).forEach(label => {
    profitTrendMap[label] = (grossTrendMap[label] || 0) - (expenseTrendMap[label] || 0)
  })

  Object.keys(cashCollectedTrendMap).forEach((label) => {
    cashCollectedTrendMap[label] += debtSettlementTrendMap[label] || 0
  })

  salesTrendSeries.value = [
    { name: 'Gross Sales', data: Object.values(grossTrendMap) },
    { name: 'Cash Collected', data: Object.values(cashCollectedTrendMap) },
  ]
  salesTrendOptions.value = {
    chart: { type: 'line', height: 350, foreColor: analyticsMutedText },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: {
      categories: Object.keys(grossTrendMap),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: { y: { formatter: val => `₱${val.toLocaleString()}` } },
    colors: ['#0ea5e9', '#10b981']
  }

  financeTrendSeries.value = [
    { name: 'Revenue', data: Object.values(grossTrendMap) },
    { name: 'Expenses', data: Object.values(expenseTrendMap) },
    { name: 'Profit', data: Object.values(profitTrendMap) },
  ]
  financeTrendOptions.value = {
    chart: { type: 'line', height: 350, foreColor: analyticsMutedText },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: {
      categories: Object.keys(grossTrendMap),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: { y: { formatter: val => `₱${val.toLocaleString()}` } },
    colors: ['#0ea5e9', '#ef4444', '#14b8a6']
  }

  debtTrendSeries.value = [
    { name: 'Receivables Created', data: Object.values(receivablesTrendMap) },
    { name: 'Debt Settlements', data: Object.values(debtSettlementTrendMap) },
  ]
  debtTrendOptions.value = {
    chart: { type: 'line', height: 350, foreColor: analyticsMutedText },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: {
      categories: Object.keys(receivablesTrendMap),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: { y: { formatter: val => `₱${val.toLocaleString()}` } },
    colors: ['#f59e0b', '#8b5cf6']
  }

  // --------------------
  // Top Items
  // --------------------
  const mapTopEntries = (filterType) => Array.from(itemTotals.entries())
    .filter(([sourceKey]) => {
      const [, rawId] = sourceKey.split(':')
      const sourceId = Number(rawId)
      const source = itemsMap.get(sourceId)
      const itemType = source?.item_type === 'service' ? 'service' : 'product'

      if (filterType === 'service') {
        return itemType === 'service'
      }

      if (filterType === 'product') {
        return itemType !== 'service'
      }

      return true
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sourceKey, qty]) => {
      const [, rawId] = sourceKey.split(':')
      const sourceId = Number(rawId)
      const source = itemsMap.get(sourceId)

      return {
        name: source?.name || sourceKey,
        value: qty,
      }
    })

  const buildBarOptions = (entries, formatter) => ({
    chart: { type: 'bar', height: 350, foreColor: analyticsMutedText },
    xaxis: {
      categories: entries.map(item => item.name),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: {
      y: {
        formatter,
      }
    }
  })

  const topProducts = mapTopEntries('product')
  const topServices = mapTopEntries('service')

  topProductsSeries.value = topProducts.map(item => item.value)
  topServicesSeries.value = topServices.map(item => item.value)
  topProductsOptions.value = buildBarOptions(topProducts, val => `${val} units`)
  topServicesOptions.value = buildBarOptions(topServices, val => `${val} services`)

  // --------------------
  // Calendar Heatmap Dynamic
  // --------------------
  let heatmapSeries = []

  if(timeRange.value === 'today') {
    // 1 day
    const today = new Date(startDate)
    const total = grossSalesMap.get(format(today, 'yyyy-MM-dd')) || 0
    heatmapSeries = [{ name: format(today,'MMM'), data:[{x: format(today,'dd'), y: total}] }]
  } else if(timeRange.value === 'week') {
    // 7 days
    heatmapSeries = []
    for(let i=0;i<7;i++){
      const d = new Date(startDate)
      d.setDate(startDate.getDate()+i)
      const total = grossSalesMap.get(format(d,'yyyy-MM-dd')) || 0
      heatmapSeries.push({ name: 'Week', data:[{x: format(d,'EEE'), y: total}] })
    }
  } else if(timeRange.value === 'month') {
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth()+1,0).getDate()
    heatmapSeries = [{ name: format(startDate,'MMM'), data: [] }]
    for(let i=1;i<=daysInMonth;i++){
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), i)
      const total = grossSalesMap.get(format(d,'yyyy-MM-dd')) || 0
      heatmapSeries[0].data.push({x:i.toString(), y: total})
    }
  } else if(timeRange.value === 'year') {
    heatmapSeries = []
    for(let m=0;m<12;m++){
      const daysInMonth = new Date(startDate.getFullYear(), m+1,0).getDate()
      const monthData = { name: format(new Date(startDate.getFullYear(),m,1),'MMM'), data: [] }
      for(let d=1;d<=daysInMonth;d++){
        const dateObj = new Date(startDate.getFullYear(),m,d)
        const total = grossSalesMap.get(format(dateObj,'yyyy-MM-dd')) || 0
        monthData.data.push({ x:d.toString(), y: total })
      }
      heatmapSeries.push(monthData)
    }
  }

  calendarSeries.value = heatmapSeries
  calendarOptions.value = {
    chart: { type:'heatmap', height: 260, foreColor: analyticsMutedText, toolbar:{show:true},width: '100%', // <-- makes chart width reactive
    toolbar: { show: false } },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.4,
        colorScale:{
          ranges:[
            {from:0,to:dailySalesQuota.value - 1,color:'#ef4444',name:'Below Target'},
            {from:dailySalesQuota.value,to:999999,color:'#22c55e',name:'Hit Target'}
          ]
        }
      }
    },
    dataLabels:{enabled:false},
    xaxis:{type:'category', labels: { style: { colors: analyticsMutedText } }, title:{text:'Day', style: { color: analyticsMutedText }}},
    yaxis:{labels: { style: { colors: [analyticsMutedText] } }, title:{text:'Month/Week', style: { color: analyticsMutedText }}} ,
    grid:{ borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip:{y:{formatter: val => `₱${val.toLocaleString()}`}}
  }
  isLoading.value = false
}

watch([timeRange, customStart, customEnd, dailySalesQuota, reportingFocus], () => updateCharts())
onMounted(updateCharts)
</script>

<template>
<div class="analytics-page">
  <!-- Loading Overlay -->
  <div v-if="isLoading" class="loading-overlay">
    <div class="spinner"></div>
    <p>Loading analytics...</p>
  </div>

  <div class="page-header">
    <h1>Analytics</h1>
  </div>

  <!-- Time Range Buttons -->
  <div class="time-range-selector">
    <button class="tab-button" :class="{ active: timeRange==='today' }" @click="timeRange='today'">Today</button>
    <button class="tab-button" :class="{ active: timeRange==='week' }" @click="timeRange='week'">This Week</button>
    <button class="tab-button" :class="{ active: timeRange==='month' }" @click="timeRange='month'">This Month</button>
    <button class="tab-button" :class="{ active: timeRange==='year' }" @click="timeRange='year'">This Year</button>
    <button class="tab-button" :class="{ active: timeRange==='custom' }" @click="timeRange='custom'">Custom Range</button>
    <div v-if="timeRange==='custom'" class="custom-range">
      <VueDatePicker
        v-model="dateRange"
        range
        :enable-time-picker="false"
        placeholder="Select custom date range"
        :dark="isDark"
        auto-apply
      />
    </div>
  </div>

  <!-- Metrics -->
  <div class="metrics-cards">
    <MetricCard
      v-for="card in metricCards"
      :key="card.title"
      :title="card.title"
      :value="card.value"
      :type="card.type"
    />
  </div>

  <!-- Charts -->
  <div class="charts-section">
    <div class="chart-card">
      <h2>{{ quotaCalendarTitle }}</h2>
      <VueApexCharts type="heatmap" :options="calendarOptions" :series="calendarSeries" height="260"/>
    </div>

    <div class="chart-card">
      <h2>Sales Trend</h2>
      <VueApexCharts type="line" :options="salesTrendOptions" :series="salesTrendSeries" height="350"/>
    </div>

    <div class="chart-card">
      <h2>Revenue, Expenses, and Profit</h2>
      <VueApexCharts type="line" :options="financeTrendOptions" :series="financeTrendSeries" height="350"/>
    </div>

    <div class="chart-card">
      <h2>Debt and Receivables Trend</h2>
      <VueApexCharts type="line" :options="debtTrendOptions" :series="debtTrendSeries" height="350"/>
    </div>

    <div v-if="showProductChart" class="chart-card">
        <h2>Top Products</h2>
        <VueApexCharts type="bar" :options="topProductsOptions" :series="[{ name: 'Units Sold', data: topProductsSeries }]" height="350"/>
    </div>

    <div v-if="showServiceChart" class="chart-card">
        <h2>Top Services</h2>
        <VueApexCharts type="bar" :options="topServicesOptions" :series="[{ name: 'Services Sold', data: topServicesSeries }]" height="350"/>
    </div>
  </div>
</div>
</template>


<style scoped>
.analytics-page {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

/* Header */
.page-header h1 {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
}

/* Time Range Selector */
.time-range-selector {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.custom-range {
  min-width: min(100%, 320px);
  flex: 1 1 320px;
}

/* Metrics Cards */
.metrics-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
  align-items: stretch;
}

/* Charts Section */
.charts-section {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.chart-card {
  background-color: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  padding: 18px;
  min-width: 0;
  overflow: hidden;
}

.chart-card h2 {
  margin: 0 0 14px;
  font-size: 18px;
  line-height: 1.3;
  text-align: left;
  color: #0f172a;
}

.chart-card :deep(.apexcharts-canvas),
.chart-card :deep(.apexcharts-svg) {
  max-width: 100%;
}

body.dark-mode .chart-card {
  background-color: #1c1c1c;
  border-color: #2e2e2e;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
}

body.dark-mode .chart-card h2 {
  color: #f8fafc;
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.loading-overlay p {
  color: #fff;
  font-size: 16px;
  font-weight: 500;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .analytics-page {
    padding: 16px;
  }

  .metrics-cards {
    grid-template-columns: 1fr;
  }

  .custom-range {
    min-width: 100%;
    flex-basis: 100%;
  }
}
</style>
