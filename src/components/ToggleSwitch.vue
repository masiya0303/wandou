<!-- wandou · 滑动开关 -->
<script setup lang="ts">
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
function toggle() { emit('update:modelValue', !props.modelValue) }
</script>

<template>
  <button
    :class="['ts', { on: modelValue }]"
    role="switch"
    :aria-checked="modelValue"
    @click="toggle"
  >
    <span class="ts-knob"></span>
  </button>
</template>

<style scoped>
.ts {
  position: relative;
  width: 40px; height: 22px;
  border-radius: 11px;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.25s ease;
  background: rgba(0,0,0,0.1);
  padding: 0;
}
.ts.on { background: var(--theme-text-accent); }

.ts-knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ts.on .ts-knob { transform: translateX(18px); background: #fff; }

.ts:active { opacity: 0.9; }
</style>
