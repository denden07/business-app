<script setup>
import { computed } from 'vue'

const props = defineProps({
  icon: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  variant: {
    type: String,
    default: 'secondary',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const iconPaths = {
  edit: [
    'M12 20h9',
    'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z',
  ],
  delete: [
    'M3 6h18',
    'M8 6V4h8v2',
    'M19 6l-1 14H6L5 6',
    'M10 11v6',
    'M14 11v6',
  ],
  view: [
    'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  archive: [
    'M3 7l1-3h16l1 3',
    'M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z',
    'M9 12h6',
  ],
  restore: [
    'M3 7l1-3h16l1 3',
    'M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z',
    'M9 13l3-3 3 3',
    'M12 10v7',
  ],
  resume: [
    'M8 5v14l11-7Z',
  ],
  void: [
    'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z',
    'm4 4-8 8',
  ],
  points: [
    'M12 2v20',
    'M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6',
  ],
}

const paths = computed(() => iconPaths[props.icon] || iconPaths.view)
</script>

<template>
  <button
    type="button"
    class="icon-action-btn btn"
    :class="variant"
    :title="label"
    :aria-label="label"
    :disabled="disabled"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        v-for="path in paths"
        :key="path"
        :d="path"
      />
    </svg>
  </button>
</template>

<style scoped>
.icon-action-btn {
  width: 36px;
  min-width: 36px;
  min-height: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.icon-action-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
</style>