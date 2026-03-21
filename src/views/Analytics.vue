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
// Load Analytics
// --------------------
let sales = []
let saleItems = []
let medicinesStore = []

const loadAnalytics = async () => {
  const db = await dbPromise
  sales = await db.getAll('sales')
  saleItems = await db.getAll('sale_items')
  medicinesStore = await db.getAll('medicines')
  updateCharts()
}

// --------------------
// Build Charts & Metrics
// --------------------
const updateCharts = async () => {
  isLoading.value = true
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 300))
  const startDate = getStartDate()
  const endDate = getEndDate()

  // Filter sales (exclude voided sales)
  const filteredSales = sales.filter(s => {
    const d = new Date(s.purchased_date || s.date)
    return d >= startDate && d <= endDate && s.status !== 'voided'
  })

  // Voided sales for metric
  const voidedSales = sales.filter(s => {
    const d = new Date(s.purchased_date || s.date)
    return d >= startDate && d <= endDate && s.status === 'voided'
  })
  voidedSalesCount.value = voidedSales.length

  const filteredSaleItems = saleItems.filter(item => {
    return filteredSales.some(s => String(s.id) === String(item.sale_id))
  })

  // Metrics
  totalSales.value = filteredSales.reduce((sum, s) => sum + Number(s.final_total || 0), 0)
  totalItems.value = filteredSaleItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0)

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
  filteredSales.forEach(sale => {
    const date = new Date(sale.purchased_date || sale.date)
    const label = format(date, 'MM/dd')
    trendMap[label] += Number(sale.final_total || 0)
  })
  salesTrendSeries.value = [{ name: 'Sales', data: Object.values(trendMap) }]
  salesTrendOptions.value = {
    chart: { type: 'line', height: 350 },
    xaxis: { categories: Object.keys(trendMap) },
    tooltip: { y: { formatter: val => `₱${val.toLocaleString()}` } },
    colors: [totalSales.value >= DAILY_TARGET ? '#22c55e' : '#ef4444']
  }

  // --------------------
  // Top Medicines
  // --------------------
  const medMap = {}
  filteredSaleItems.forEach(item => {
    medMap[item.medicine_id] = (medMap[item.medicine_id] || 0) + Number(item.quantity || 0)
  })
  const topMeds = Object.entries(medMap)
    .map(([id, qty]) => {
      const med = medicinesStore.find(m => String(m.id) === String(id))
      return { name: med?.name || id, value: qty }
    })
    .sort((a,b)=>b.value-a.value)
    .slice(0,5)
  topMedicinesSeries.value = topMeds.map(m=>m.value)
  topMedicinesOptions.value = {
    chart: { type: 'bar', height: 350 },
    xaxis: { categories: topMeds.map(m=>m.name) },
    tooltip: { y: { formatter: val => `${val} pcs` } }
  }

  // --------------------
  // Calendar Heatmap Dynamic
  // --------------------
  let heatmapSeries = []

  if(timeRange.value === 'today') {
    // 1 day
    const today = filteredSales[0] ? new Date(filteredSales[0].purchased_date || filteredSales[0].date) : new Date()
    const total = filteredSales.reduce((sum, s)=>sum+Number(s.final_total||0),0)
    heatmapSeries = [{ name: format(today,'MMM'), data:[{x: format(today,'dd'), y: total}] }]
  } else if(timeRange.value === 'week') {
    // 7 days
    heatmapSeries = []
    for(let i=0;i<7;i++){
      const d = new Date(startDate)
      d.setDate(startDate.getDate()+i)
      const total = filteredSales
        .filter(s=>format(new Date(s.purchased_date||s.date),'yyyy-MM-dd') === format(d,'yyyy-MM-dd'))
        .reduce((sum,s)=>sum+Number(s.final_total||0),0)
      heatmapSeries.push({ name: 'Week', data:[{x: format(d,'EEE'), y: total}] })
    }
  } else if(timeRange.value === 'month') {
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth()+1,0).getDate()
    heatmapSeries = [{ name: format(startDate,'MMM'), data: [] }]
    for(let i=1;i<=daysInMonth;i++){
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), i)
      const total = filteredSales
        .filter(s=>format(new Date(s.purchased_date||s.date),'yyyy-MM-dd')===format(d,'yyyy-MM-dd'))
        .reduce((sum,s)=>sum+Number(s.final_total||0),0)
      heatmapSeries[0].data.push({x:i.toString(), y: total})
    }
  } else if(timeRange.value === 'year') {
    heatmapSeries = []
    for(let m=0;m<12;m++){
      const daysInMonth = new Date(startDate.getFullYear(), m+1,0).getDate()
      const monthData = { name: format(new Date(startDate.getFullYear(),m,1),'MMM'), data: [] }
      for(let d=1;d<=daysInMonth;d++){
        const dateObj = new Date(startDate.getFullYear(),m,d)
        const total = filteredSales
          .filter(s=>format(new Date(s.purchased_date||s.date),'yyyy-MM-dd')===format(dateObj,'yyyy-MM-dd'))
          .reduce((sum,s)=>sum+Number(s.final_total||0),0)
        monthData.data.push({ x:d.toString(), y: total })
      }
      heatmapSeries.push(monthData)
    }
  }

  calendarSeries.value = heatmapSeries
  calendarOptions.value = {
    chart: { type:'heatmap', height: 260, toolbar:{show:true},width: '100%', // <-- makes chart width reactive
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
    xaxis:{type:'category', title:{text:'Day'}},
    yaxis:{title:{text:'Month/Week'}} ,
    tooltip:{y:{formatter: val => `₱${val.toLocaleString()}`}}
  }
  isLoading.value = false
}

watch([timeRange, customStart, customEnd], () => updateCharts())
onMounted(loadAnalytics)
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
    <button @click="timeRange='today'">Today</button>
    <button @click="timeRange='week'">This Week</button>
    <button @click="timeRange='month'">This Month</button>
    <button @click="timeRange='year'">This Year</button>
    <button @click="timeRange='custom'">Custom Range</button>
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
  <div class="metrics-cards top-bar">
    <MetricCard :title="salesLabel" :value="totalSales" type="currency" />
    <MetricCard :title="itemsLabel" :value="totalItems" type="number" />
    <MetricCard title="Voided Sales" :value="voidedSalesCount" type="number" />
  </div>

  <!-- Charts -->
  <div class="charts-section top-bar">
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
  margin: auto;
  padding: 20px;
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
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.time-range-selector button {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid #ccc;
  cursor: pointer;
}

.custom-range input {
  margin-left: 4px;
}

/* Metrics Cards */
.metrics-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

/* Charts Section */
.charts-section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  flex-direction: column;
}

.chart-card {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  padding: 16px;
  flex: 1 1 300px;
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
</style>
