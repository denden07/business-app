import { createApp } from 'vue'
import './style.css'
import './globals.css'
import './assets/tables.css'
import './dark-mode.css'
import App from './App.vue'
import './db';
// import './db/sampleData.js';
import store from './store';
import router from './router';

createApp(App).use(store).use(router)
.mount('#app')
