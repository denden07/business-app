# Backlogs

This file only keeps work that is still pending.

Completed work such as template foundation, first-run setup, initial template customization, customer-rule wiring, and settings entry points should stay in [docs/checklist.md](docs/checklist.md), not here.

## Priority Order

1. Inventory Purchase Cost and COGS Tracking
	- highest priority because true profit, loss, and margin reporting depend on purchase-cost tracking instead of sales-minus-expenses only
2. Multi-Business Support
	- large change because it introduces business registry and switching
3. Separate Database Per Business
	- large change because it requires migration and business-scoped data isolation
4. Cross-Business Analytics
	- heaviest change because it depends on multi-business isolation and cross-database aggregation

## 1. Inventory Purchase Cost and COGS Tracking

### Summary

Track inventory purchases and batch-level purchase cost so analytics can compute cost of goods sold, gross profit, and more accurate net profit instead of relying on sales minus expenses alone.

### Remaining goals

- add purchase-cost fields to stock batches or a dedicated purchase ledger
- distinguish inventory purchases from generic stock adjustments
- capture supplier or purchase reference details where useful
- record cost consumed when stock is sold so each sale can carry a stable historical cost
- compute cost of goods sold (COGS) for the selected reporting period
- add gross profit and net profit reporting based on revenue, COGS, and operating expenses

### Open questions

- should cost live directly on `item_batches`, or in a separate purchases table linked to batches?
- should service items support optional direct cost or labor-cost tracking too?
- should manual stock adjustments affect COGS, or stay separate as inventory corrections?

### Tradeoffs to keep in mind

- batch-level cost is more accurate than a single per-item purchase cost
- storing cost at sale time makes historical profit reporting more stable
- inventory purchases should not be treated the same way as operating expenses if profit accuracy matters

## 2. Multi-Business Support

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

## 3. Separate Database Per Business

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

## 4. Cross-Business Analytics

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