import { createApp } from 'vue'
import './style.css'
import './assets/tables.css'
import App from './App.vue'
import './db';
// import './db/sampleData.js';
import store from './store';
import router from './router';

createApp(App).use(store).use(router)
.mount('#app')
