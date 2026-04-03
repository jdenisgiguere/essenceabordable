<template>
  <div class="app-shell">
    <div class="app-nav-shell">
      <nav class="route-nav" aria-label="Navigation dataviz">
        <RouterLink class="route-link" to="/">Carte</RouterLink>
        <RouterLink class="route-link" to="/autour-de-moi">Autour de moi</RouterLink>
      </nav>
    </div>
    <RouterView />
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router';
</script>
