# Backlogs

This file only keeps work that is still pending.

Completed work such as template foundation, first-run setup, initial template customization, customer-rule wiring, and settings entry points should stay in [docs/checklist.md](docs/checklist.md), not here.

## Priority Order

1. Debt sale tracking
	- moderate effort because it affects checkout, customers, sales history, and reporting
2. Budgeting feature
	- moderate effort because expenses and profit reporting need new storage, UI, and analytics integration
3. Multi-Business Support
	- large change because it introduces business registry and switching
4. Separate Database Per Business
	- large change because it requires migration and business-scoped data isolation
5. Cross-Business Analytics
	- heaviest change because it depends on multi-business isolation and cross-database aggregation

## 1. Debt Sale Tracking

Add a way to mark and manage sales that are not fully paid at the time of checkout.

Remaining goals:

- mark a sale as debt or unpaid balance during checkout
- connect debt records to a customer when customer tracking is enabled
- store outstanding balance and payment status in sale records
- distinguish fully paid, partially paid, and unpaid sales in history and reporting
- allow later settlement or follow-up payment recording
- define how debt sales affect total sales, collected revenue, and outstanding receivables in reporting

Notes:

- if customer tracking is enabled, debt should be attached to the selected customer record for follow-up and settlement history
- reporting should not treat debt the same as fully collected cash; totals should clearly separate gross sale value, collected amount, and remaining receivables where needed

## 2. Budgeting Feature

Add an expense and budgeting layer so the app can track money going out, not only sales coming in.

Remaining goals:

- track expenses by date, category, and amount
- define budget entries or spending buckets where useful
- integrate expenses into analytics views and summaries
- compute profit using sales minus expenses
- distinguish revenue, expenses, and profit clearly in reports and dashboards

## 3. Multi-Business Support

### Summary

Support multiple businesses owned by the same user, where each business has its own operational data boundary while the owner can still manage them from one app.

### Remaining goals

- central business registry
- active business selection and switching
- business creation flow
- business-scoped settings container

### Open questions

- should customers be isolated per business or optionally shared?
- which settings stay global versus business-specific?
- how should backup and restore work for one business versus the full owner profile?

## 4. Separate Database Per Business

### Summary

Move from the current single-business runtime model to one operational database per business once the business registry exists.

### Remaining goals

- one database per business
- migration strategy for current installs
- business-scoped operational stores for items, sales, customers, drafts, and settings
- per-business backup and restore behavior

### Tradeoffs to keep in mind

- cleaner data isolation between businesses
- more migration and switching complexity
- combined analytics becomes a cross-database aggregation problem

## 5. Cross-Business Analytics

### Summary

Allow the owner to switch between analytics for the current business and combined analytics across multiple businesses.

### Remaining goals

- analytics scope selector
- combined revenue totals
- per-business contribution breakdown
- multi-database aggregation or summary-store strategy

### Expected metrics

- total revenue
- total items sold
- transaction count
- revenue trend over time
- revenue contribution by business

## Delivery Order Notes

- do not start separate per-business databases before business registry is stable
- do not build combined analytics before business isolation exists
- keep the current single-business POS flow working while multi-business is being introduced