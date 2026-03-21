<template>
  <div class="metric-card">
    <div class="metric-title">{{ title }}</div>

    <div class="metric-value">
      <span v-if="type === 'currency'">₱</span>{{ formattedValue }}
    </div>

    <div class="metric-period" v-if="periodLabel">
      {{ periodLabel }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  value: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    default: 'currency' // 'currency' | 'number'
  },
  period: {
    type: String,
    default: '' // daily, weekly, monthly, yearly
  }
})

const formattedValue = computed(() => {
  return Number(props.value || 0).toLocaleString()
})

const periodLabel = computed(() => {
  switch (props.period) {
    case 'daily': return 'Today'
    case 'weekly': return 'This Week'
    case 'monthly': return 'This Month'
    case 'yearly': return 'This Year'
    default: return ''
  }
})
</script>

<style scoped>
.metric-card {
  background-color: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  padding: 18px;
  min-height: 140px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
}

.metric-title {
  font-size: 14px;
  font-weight: 600;
  color: #555;
  margin-bottom: 10px;
}

.metric-value {
  font-size: clamp(28px, 4vw, 36px);
  font-weight: bold;
  line-height: 1.1;
  margin-bottom: 12px;
}

.metric-period {
  font-size: 12px;
  color: #888;
  margin-top: auto;
}

body.dark-mode .metric-card {
  background-color: #1c1c1c;
  border-color: #2e2e2e;
  color: #eee;
}

body.dark-mode .metric-title {
  color: #cbd5e1;
}

body.dark-mode .metric-period {
  color: #94a3b8;
}
</style>
