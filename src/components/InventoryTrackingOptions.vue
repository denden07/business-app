<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  trackStock: {
    type: Boolean,
    default: false,
  },
  trackBatches: {
    type: Boolean,
    default: false,
  },
  trackExpiry: {
    type: Boolean,
    default: false,
  },
  stockDisabled: {
    type: Boolean,
    default: false,
  },
  batchesDisabled: {
    type: Boolean,
    default: false,
  },
  expiryDisabled: {
    type: Boolean,
    default: false,
  },
  stockDisabledReason: {
    type: String,
    default: '',
  },
  batchesDisabledReason: {
    type: String,
    default: '',
  },
  expiryDisabledReason: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:trackStock', 'update:trackBatches', 'update:trackExpiry'])
const activeTooltipKey = ref(null)
const isDarkMode = ref(false)
let bodyClassObserver = null

const options = computed(() => ([
  {
    key: 'track-stock',
    label: 'Track stock',
    modelValue: props.trackStock,
    disabled: props.stockDisabled,
    disabledReason: props.stockDisabledReason,
    tooltip: 'Use this for physical products that need quantity tracking. Services usually leave this off.',
    update: value => emit('update:trackStock', value),
  },
  {
    key: 'track-batches',
    label: 'Track batches',
    modelValue: props.trackBatches,
    disabled: props.batchesDisabled,
    disabledReason: props.batchesDisabledReason,
    tooltip: 'Batch tracking depends on stock tracking because batches are inventory sub-groups under the same item.',
    update: value => emit('update:trackBatches', value),
  },
  {
    key: 'track-expiry',
    label: 'Track expiry',
    modelValue: props.trackExpiry,
    disabled: props.expiryDisabled,
    disabledReason: props.expiryDisabledReason,
    tooltip: 'Expiry tracking depends on batch tracking because expiry is evaluated per batch entry.',
    update: value => emit('update:trackExpiry', value),
  },
]))

function handleToggle(option, event) {
  option.update(event.target.checked)
}

function suppressLabelToggle(event) {
  event.preventDefault()
  event.stopPropagation()
}

function openTooltip(key) {
  activeTooltipKey.value = key
}

function closeTooltip(key) {
  if (activeTooltipKey.value === key) {
    activeTooltipKey.value = null
  }
}

function toggleTooltip(key, event) {
  suppressLabelToggle(event)
  activeTooltipKey.value = activeTooltipKey.value === key ? null : key
}

function syncDarkMode() {
  isDarkMode.value = typeof document !== 'undefined' && document.body.classList.contains('dark-mode')
}

onMounted(() => {
  syncDarkMode()

  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
    return
  }

  bodyClassObserver = new MutationObserver(syncDarkMode)
  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  bodyClassObserver?.disconnect()
})
</script>

<template>
  <div
    class="inventory-options"
    :class="{ 'is-dark-mode': isDarkMode }"
    role="group"
    aria-label="Inventory tracking options"
  >
    <label
      v-for="option in options"
      :key="option.key"
      class="inventory-option"
      :class="{
        'is-disabled': option.disabled,
        'is-active': option.modelValue,
      }"
    >
      <input
        :checked="option.modelValue"
        type="checkbox"
        :disabled="option.disabled"
        @change="handleToggle(option, $event)"
      />

      <div class="inventory-option-copy">
        <div class="inventory-option-heading">
          <strong>{{ option.label }}</strong>
          <button
            class="inventory-tooltip-anchor"
            type="button"
            :aria-label="option.tooltip"
            :aria-expanded="activeTooltipKey === option.key"
            @mouseenter="openTooltip(option.key)"
            @mouseleave="closeTooltip(option.key)"
            @focus="openTooltip(option.key)"
            @blur="closeTooltip(option.key)"
            @click="toggleTooltip(option.key, $event)"
          >
            ?
            <span v-if="activeTooltipKey === option.key" class="inventory-tooltip">{{ option.tooltip }}</span>
          </button>
        </div>

        <small v-if="option.disabled && option.disabledReason" class="inventory-option-status">{{ option.disabledReason }}</small>
      </div>
    </label>
  </div>
</template>

<style scoped>
.inventory-options {
  display: grid;
  gap: 12px;
  --inventory-option-border: rgba(148, 163, 184, 0.18);
  --inventory-option-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%);
  --inventory-option-active-border: rgba(14, 116, 144, 0.28);
  --inventory-option-active-bg: linear-gradient(180deg, rgba(240, 249, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
  --inventory-option-disabled-border: rgba(148, 163, 184, 0.14);
  --inventory-option-disabled-bg: linear-gradient(180deg, rgba(248, 250, 252, 0.72) 0%, rgba(241, 245, 249, 0.92) 100%);
  --inventory-option-title: #0f172a;
  --inventory-option-title-disabled: #64748b;
  --inventory-option-status: #64748b;
  --inventory-checkbox-accent: #0f766e;
  --inventory-icon-bg: linear-gradient(180deg, rgba(14, 116, 144, 0.14) 0%, rgba(14, 116, 144, 0.08) 100%);
  --inventory-icon-bg-hover: linear-gradient(180deg, rgba(14, 116, 144, 0.18) 0%, rgba(14, 116, 144, 0.12) 100%);
  --inventory-icon-color: #0f766e;
  --inventory-icon-ring: rgba(14, 116, 144, 0.08);
  --inventory-icon-focus: rgba(14, 116, 144, 0.2);
  --inventory-tooltip-bg: #0f172a;
  --inventory-tooltip-color: #f8fafc;
  --inventory-tooltip-shadow: 0 16px 32px rgba(15, 23, 42, 0.22);
  --inventory-option-elevation: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.inventory-option {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 12px;
  align-items: start;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--inventory-option-border);
  background: var(--inventory-option-bg);
  box-shadow: var(--inventory-option-elevation);
  transition: border-color 0.18s ease, background-color 0.18s ease, opacity 0.18s ease;
}

.inventory-option.is-active {
  border-color: var(--inventory-option-active-border);
  background: var(--inventory-option-active-bg);
}

.inventory-option.is-disabled {
  background: var(--inventory-option-disabled-bg);
  border-color: var(--inventory-option-disabled-border);
}

.inventory-option input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  align-self: start;
  accent-color: var(--inventory-checkbox-accent);
}

.inventory-option-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding-top: 1px;
}

.inventory-option-heading {
  display: flex;
  align-items: center;
  min-height: 20px;
  gap: 8px;
}

.inventory-option-heading strong {
  color: var(--inventory-option-title);
  font-size: 15px;
  line-height: 1.2;
}

.inventory-option.is-disabled .inventory-option-heading strong {
  color: var(--inventory-option-title-disabled);
}

.inventory-option-status {
  color: var(--inventory-option-status);
  font-size: 13px;
  line-height: 1.45;
}

.inventory-tooltip-anchor {
  position: relative;
  display: inline-flex;
  flex: 0 0 22px;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: var(--inventory-icon-bg);
  color: var(--inventory-icon-color);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: help;
  outline: none;
  border: none;
  padding: 0;
  box-shadow: inset 0 0 0 1px var(--inventory-icon-ring);
}

.inventory-tooltip-anchor:focus-visible {
  box-shadow: inset 0 0 0 1px var(--inventory-icon-ring), 0 0 0 2px var(--inventory-icon-focus);
}

.inventory-tooltip-anchor:hover {
  background: var(--inventory-icon-bg-hover);
}

.inventory-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  z-index: 10;
  width: min(240px, calc(100vw - 48px));
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--inventory-tooltip-bg);
  color: var(--inventory-tooltip-color);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  text-align: left;
  opacity: 1;
  box-shadow: var(--inventory-tooltip-shadow);
  transform: translate(-50%, 4px);
  animation: tooltip-fade-in 0.18s ease forwards;
  pointer-events: none;
}

.inventory-tooltip::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 10px;
  height: 10px;
  background: var(--inventory-tooltip-bg);
  transform: translate(-50%, -50%) rotate(45deg);
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: translate(-50%, 4px);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.inventory-options.is-dark-mode {
  gap: 12px;
  --inventory-option-border: rgba(148, 163, 184, 0.12);
  --inventory-option-bg: linear-gradient(180deg, #343f4a 0%, #2f3943 100%);
  --inventory-option-active-border: rgba(56, 189, 248, 0.34);
  --inventory-option-active-bg: linear-gradient(180deg, #3c4956 0%, #34404b 100%);
  --inventory-option-disabled-border: rgba(148, 163, 184, 0.08);
  --inventory-option-disabled-bg: linear-gradient(180deg, #2f3842 0%, #29323b 100%);
  --inventory-option-title: #f8fafc;
  --inventory-option-title-disabled: #cbd5e1;
  --inventory-option-status: #94a3b8;
  --inventory-checkbox-accent: #38bdf8;
  --inventory-icon-bg: linear-gradient(180deg, rgba(56, 189, 248, 0.18) 0%, rgba(14, 165, 233, 0.12) 100%);
  --inventory-icon-bg-hover: linear-gradient(180deg, rgba(56, 189, 248, 0.24) 0%, rgba(14, 165, 233, 0.16) 100%);
  --inventory-icon-color: #bae6fd;
  --inventory-icon-ring: rgba(125, 211, 252, 0.12);
  --inventory-icon-focus: rgba(56, 189, 248, 0.28);
  --inventory-tooltip-bg: #020617;
  --inventory-tooltip-color: #e2e8f0;
  --inventory-tooltip-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
  --inventory-option-elevation: inset 0 1px 0 rgba(148, 163, 184, 0.08), inset 0 -1px 0 rgba(2, 6, 23, 0.24);
}

@media (max-width: 640px) {
  .inventory-option {
    gap: 12px;
    padding: 13px 14px;
  }

  .inventory-tooltip {
    left: 0;
    transform: translate(0, 4px);
  }

  .inventory-tooltip::after {
    left: 18px;
  }

  .inventory-tooltip {
    animation-name: tooltip-fade-in-mobile;
  }

  @keyframes tooltip-fade-in-mobile {
    from {
      opacity: 0;
      transform: translate(0, 4px);
    }

    to {
      opacity: 1;
      transform: translate(0, 0);
    }
  }
}
</style>