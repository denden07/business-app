<template>
  <div class="search-input" :class="wrapperClass">
    <input
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      :class="['input', inputClass]"
    />
    <button
      v-if="clearable && modelValue"
      type="button"
      class="clear-btn"
      @click="$emit('update:modelValue', '')"
      aria-label="Clear"
    >
      ×
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: 'Search...' },
  clearable: { type: Boolean, default: true },
  inputClass: { type: [String, Object, Array], default: '' },
  wrapperClass: { type: [String, Object, Array], default: '' }
})

const emits = defineEmits(['update:modelValue'])
</script>

<style scoped>
.search-input {
  position: relative;
  display: inline-block;
  width: auto; /* default: inline so it sits beside other controls */
  flex: 1;
}

.search-input.full {
  width: 100%; /* utility wrapper class to make the input full-width */
}

.search-input input {
  width: 100%; /* default inline width */
  padding-right: 34px; /* allow space for clear button */
}

.search-input.full input {
  width: 100%;
}

.clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid rgba(220, 20, 60, 0.15);
  background: linear-gradient(180deg, #fff5f7 0%, #ffe8ed 100%);
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  color: #DC143C;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(220, 20, 60, 0.12);
}

.clear-btn:hover {
  color: #b01033;
}
</style>
