<script setup lang="ts">
// Old address: the MyTPlus log is now a tab on /logs (filters in the query are kept).
const route = useRoute()
await navigateTo({ path: '/logs', query: { ...route.query, tab: 'mytplus' } }, { replace: true })
</script>

<template>
  <div />
</template>
