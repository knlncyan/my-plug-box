<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createPluginApi } from '@plug-box/plugin-sdk';
import './style.css';

const result = ref('ready');

onMounted(async () => {
  const api = await createPluginApi();
  const value = await api.get('commands').execute('external.demo-vue.ping');
  result.value = String(value);
});
</script>

<template>
  <div class="demo-view-root">
    <h2>Demo View</h2>
    <p>Command Result: {{ result }}</p>
  </div>
</template>

