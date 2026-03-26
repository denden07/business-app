# Backlogs

This file only keeps work that is still pending.

Completed work such as template foundation, first-run setup, initial template customization, customer-rule wiring, and settings entry points should stay in [docs/checklist.md](docs/checklist.md), not here.

## Priority Order

1. Multi-Business Support
	- large change because it introduces business registry and switching
2. Separate Database Per Business
	- large change because it requires migration and business-scoped data isolation
3. Cross-Business Analytics
	- heaviest change because it depends on multi-business isolation and cross-database aggregation

## 1. Multi-Business Support

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

## 2. Separate Database Per Business

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

## 3. Cross-Business Analytics

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