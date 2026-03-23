<template>
  <div v-if="showContainer" class="pagination-block">
    <div v-if="showSummary" class="pagination-summary">
      Showing {{ itemCount }} of {{ totalItems }}
    </div>

    <div class="pagination" v-if="totalPages > 1">
      <button @click="setPage(page - 1)" :disabled="page === 1">Prev</button>

      <button
        v-if="pages[0] > 1"
        @click="setPage(1)"
        :class="{ active: page === 1 }"
      >1</button>

      <span v-if="pages[0] > 2">…</span>

      <button
        v-for="p in pages"
        :key="p"
        @click="setPage(p)"
        :class="{ active: page === p }"
        :aria-current="page === p ? 'page' : null"
      >
        {{ p }}
      </button>

      <span v-if="pages[pages.length - 1] < totalPages - 1">…</span>

      <button
        v-if="pages[pages.length - 1] < totalPages"
        @click="setPage(totalPages)"
        :class="{ active: page === totalPages }"
      >
        {{ totalPages }}
      </button>

      <button @click="setPage(page + 1)" :disabled="page === totalPages">Next</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  maxPages: { type: Number, default: 5 },
  itemCount: { type: Number, default: null },
  totalItems: { type: Number, default: null }
})
const emit = defineEmits(['update:page'])

const showSummary = computed(() => props.itemCount !== null && props.totalItems !== null)
const showContainer = computed(() => showSummary.value || props.totalPages > 1)

const pages = computed(() => {
  const total = props.totalPages
  const max = Math.max(1, props.maxPages)
  const current = props.page
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1)

  const half = Math.floor(max / 2)
  let start = Math.max(1, current - half)
  let end = start + max - 1
  if (end > total) {
    end = total
    start = total - max + 1
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

function setPage(p) {
  if (p < 1) p = 1
  if (p > props.totalPages) p = props.totalPages
  if (p === props.page) return
  emit('update:page', p)
}
</script>

<style scoped>
.pagination-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.pagination-summary {
  font-size: 14px;
  color: #5f6b7a;
}

body.dark-mode .pagination-summary {
  color: #9aa6b2;
}
</style>

