import { createRouter, createWebHashHistory } from 'vue-router';
import NearMeView from '../views/NearMeView.vue';
import StationsMapView from '../views/StationsMapView.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'stations-map',
      component: StationsMapView
    },
    {
      path: '/autour-de-moi',
      name: 'autour-de-moi',
      component: NearMeView
    }
  ]
});

export default router;
