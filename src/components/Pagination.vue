<template>
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
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  maxPages: { type: Number, default: 5 }
})
const emit = defineEmits(['update:page'])

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
.pagination button.active {
  background-color: #16a085;
  color: #fff;
  box-shadow: 0 6px 14px rgba(22,160,133,0.14);
  transform: translateY(-1px);
}

.pagination span {
  display: inline-block;
  padding: 6px 8px;
}
.pagination {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 6px;
  align-items: center;
}

.pagination button {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  color: #222;
  cursor: pointer;
}

.pagination button[aria-current="page"] {
  pointer-events: none;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #f0f0f0;
  color: #999;
}
</style>
