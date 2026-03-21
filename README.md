# Pharmacy POS POC

Pharmacy POS POC is an offline-first pharmacy inventory and sales tracking application built for small-business daily operations. It helps users monitor medicines, manage inventory flow, record customer activity, track drafts and transactions, and review analytics without requiring a live backend service.

This project is a Vue 3 single-page application powered by Vite, Vue Router, Vuex, and IndexedDB. It also includes a Capacitor Android project for mobile builds.

## What The App Does

The application is designed to support internal store operations such as:

- monitoring available medicines and stock movement
- recording sales activity and draft sales
- tracking customers and transaction history
- reviewing operational analytics and top-selling items
- working offline with locally stored data
- controlling visible pages through settings

The app is best treated as an internal inventory and sales monitoring tool for day-to-day reference.

## Main Features

- Offline local data storage using IndexedDB
- Medicine listing and medicine detail views
- Inventory tracking and stock-related workflows
- Sales entry and saved drafts
- Customer records and transaction history
- Analytics dashboard for sales trends and top medicines
- Page visibility settings
- Dark mode support
- Capacitor Android integration

## App Sections

- Home: quick workflow for searching medicines, selecting customers, and building a sale
- Medicines: medicine records and detail pages
- Inventory: inventory-related data views
- Sales: sales records and review screens
- Drafts: unfinished or saved sale entries
- Customers: customer data and transaction lookup
- Analytics: summarized business activity and trends
- About: app description, disclaimer, and contact details
- Settings: page visibility, backup/restore, and other configuration tools

## Tech Stack

- Vue 3
- Vite
- Vue Router
- Vuex
- IndexedDB via idb
- ApexCharts / vue3-apexcharts
- Chart.js / vue-chartjs
- Capacitor Android

## Project Structure

Key folders in the project:

- `src/views` for page-level screens
- `src/components` for reusable UI components
- `src/store` for Vuex modules
- `src/db` for IndexedDB data access and persistence helpers
- `src/router` for route definitions
- `android` for the native Capacitor Android project

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Android / Capacitor

This repository includes a Capacitor Android project inside the `android/` directory.

Typical workflow:

```bash
npx cap sync android
```

Then open the Android project in Android Studio if you need a native build.

## Data And Storage

- The app stores operational data locally in IndexedDB.
- Database setup is initialized on app startup from `src/main.js` through the `src/db` module.
- Because data is stored locally, backup and restore workflows are important for preserving records.

## Important Disclaimer

This application is designed as an offline inventory and sales tracking tool intended to assist small businesses in monitoring daily operations.

This software does not generate official receipts, invoices, or tax documents and is not intended to replace any government-registered POS, accounting system, or formal bookkeeping records.

Users are responsible for complying with all applicable laws, tax rules, and reporting requirements in their jurisdiction. Any records stored in the app should be treated as internal operational data unless verified and transferred into an appropriate official system.

## Contact

For questions or clarifications about the application:

- Mobile: 09300560720
- Email: marcaldrin_0717@gmail.com
