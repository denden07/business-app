<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { dbPromise } from '../db'
import MetricCard from '../components/analytics/MetricCard.vue'
import VueApexCharts from 'vue3-apexcharts'
import { format } from 'date-fns'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

// --------------------
// Metrics
// --------------------
const totalSales = ref(0)
const totalItems = ref(0)
const voidedSalesCount = ref(0)

// --------------------
// Charts
// --------------------
const salesTrendOptions = ref({})
const salesTrendSeries = ref([])
const topMedicinesOptions = ref({})
const topMedicinesSeries = ref([])
const calendarOptions = ref({})
const calendarSeries = ref([])

const DAILY_TARGET = 40000
const isLoading = ref(false)

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
    case 'today': return 'Total Sales Today'
    case 'week': return 'Total Sales This Week'
    case 'month': return 'Total Sales This Month'
    case 'year': return 'Total Sales This Year'
    case 'custom': return 'Total Sales (Custom Range)'
    default: return 'Total Sales'
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
    case 'custom': return customStart.value ? startOfDay(new Date(customStart.value)) : startOfDay(now)
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
    case 'custom': return customEnd.value ? endOfDay(new Date(customEnd.value)) : endOfDay(now)
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
  const [sales, saleItems, medicines] = await Promise.all([
    db.getAll('sales'),
    db.getAll('sale_items'),
    db.getAll('medicines')
  ])
  const includedSaleIds = new Set()
  const dailySalesMap = new Map()
  const medicinesMap = new Map(medicines.map(medicine => [medicine.id, medicine]))

  totalSales.value = 0
  totalItems.value = 0
  voidedSalesCount.value = 0

  for (const sale of sales) {
    const saleDate = new Date(sale.purchased_date || sale.date)
    if (saleDate < startDate || saleDate > endDate) continue

    if (sale.status === 'voided') {
      voidedSalesCount.value += 1
      continue
    }

    includedSaleIds.add(sale.id)
    const saleTotal = Number(sale.final_total || 0)
    totalSales.value += saleTotal

    const dayKey = format(saleDate, 'yyyy-MM-dd')
    dailySalesMap.set(dayKey, (dailySalesMap.get(dayKey) || 0) + saleTotal)
  }

  const medicineTotals = new Map()
  for (const item of saleItems) {
    if (!includedSaleIds.has(item.sale_id)) continue

    totalItems.value += Number(item.quantity || 0)
    medicineTotals.set(
      item.medicine_id,
      (medicineTotals.get(item.medicine_id) || 0) + Number(item.quantity || 0)
    )
  }

  // --------------------
  // Sales Trend
  // --------------------
  const dayCount = Math.ceil((endDate - startDate) / (1000*60*60*24)) + 1
  const trendMap = {}
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    trendMap[format(d, 'MM/dd')] = 0
  }
  dailySalesMap.forEach((value, key) => {
    const label = format(new Date(key), 'MM/dd')
    if (trendMap[label] !== undefined) {
      trendMap[label] += value
    }
  })
  salesTrendSeries.value = [{ name: 'Sales', data: Object.values(trendMap) }]
  salesTrendOptions.value = {
    chart: { type: 'line', height: 350, foreColor: analyticsMutedText },
    xaxis: {
      categories: Object.keys(trendMap),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: { y: { formatter: val => `₱${val.toLocaleString()}` } },
    colors: [totalSales.value >= DAILY_TARGET ? '#22c55e' : '#ef4444']
  }

  // --------------------
  // Top Medicines
  // --------------------
  const topMeds = await Promise.all(
    Array.from(medicineTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(async ([id, qty]) => {
        const med = medicinesMap.get(id)
        return { name: med?.name || id, value: qty }
      })
  )
  topMedicinesSeries.value = topMeds.map(m=>m.value)
  topMedicinesOptions.value = {
    chart: { type: 'bar', height: 350, foreColor: analyticsMutedText },
    xaxis: {
      categories: topMeds.map(m=>m.name),
      labels: { style: { colors: analyticsMutedText } },
    },
    yaxis: {
      labels: { style: { colors: [analyticsMutedText] } },
    },
    grid: { borderColor: analyticsGridColor },
    legend: { labels: { colors: analyticsCardText } },
    tooltip: { y: { formatter: val => `${val} pcs` } }
  }

  // --------------------
  // Calendar Heatmap Dynamic
  // --------------------
  let heatmapSeries = []

  if(timeRange.value === 'today') {
    // 1 day
    const today = new Date(startDate)
    const total = dailySalesMap.get(format(today, 'yyyy-MM-dd')) || 0
    heatmapSeries = [{ name: format(today,'MMM'), data:[{x: format(today,'dd'), y: total}] }]
  } else if(timeRange.value === 'week') {
    // 7 days
    heatmapSeries = []
    for(let i=0;i<7;i++){
      const d = new Date(startDate)
      d.setDate(startDate.getDate()+i)
      const total = dailySalesMap.get(format(d,'yyyy-MM-dd')) || 0
      heatmapSeries.push({ name: 'Week', data:[{x: format(d,'EEE'), y: total}] })
    }
  } else if(timeRange.value === 'month') {
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth()+1,0).getDate()
    heatmapSeries = [{ name: format(startDate,'MMM'), data: [] }]
    for(let i=1;i<=daysInMonth;i++){
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), i)
      const total = dailySalesMap.get(format(d,'yyyy-MM-dd')) || 0
      heatmapSeries[0].data.push({x:i.toString(), y: total})
    }
  } else if(timeRange.value === 'year') {
    heatmapSeries = []
    for(let m=0;m<12;m++){
      const daysInMonth = new Date(startDate.getFullYear(), m+1,0).getDate()
      const monthData = { name: format(new Date(startDate.getFullYear(),m,1),'MMM'), data: [] }
      for(let d=1;d<=daysInMonth;d++){
        const dateObj = new Date(startDate.getFullYear(),m,d)
        const total = dailySalesMap.get(format(dateObj,'yyyy-MM-dd')) || 0
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
            {from:0,to:DAILY_TARGET-1,color:'#ef4444',name:'Below Target'},
            {from:DAILY_TARGET,to:999999,color:'#22c55e',name:'Hit Target'}
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

watch([timeRange, customStart, customEnd], () => updateCharts())
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
    <MetricCard :title="salesLabel" :value="totalSales" type="currency" />
    <MetricCard :title="itemsLabel" :value="totalItems" type="number" />
    <MetricCard title="Voided Sales" :value="voidedSalesCount" type="number" />
  </div>

  <!-- Charts -->
  <div class="charts-section">
    <div class="chart-card">
      <h2>Sales Quota Calendar (₱40,000/day)</h2>
      <VueApexCharts type="heatmap" :options="calendarOptions" :series="calendarSeries" height="260"/>
    </div>

    <div class="chart-card">
      <h2>Sales Trend</h2>
      <VueApexCharts type="line" :options="salesTrendOptions" :series="salesTrendSeries" height="350"/>
    </div>

    <div class="chart-card">
      <h2>Top Medicines</h2>
      <VueApexCharts type="bar" :options="topMedicinesOptions" :series="[{ name:'Quantity Sold', data:topMedicinesSeries }] " height="350"/>
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
