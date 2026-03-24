# Refactor Checklist

## Phase 1: Parallel Items Foundation

Status: completed on 2026-03-23

Completed

- Added new IndexedDB stores in [src/db/index.js](src/db/index.js): `items` and `item_batches`
- Kept existing `medicines`, `inventory_batches`, and POS flow untouched for backward compatibility
- Added a new Vuex module in [src/store/items.js](src/store/items.js) for item catalog loading, filtering, sorting, stock totals, add, update, archive, and restore
- Registered the module in [src/store/index.js](src/store/index.js)
- Added a new route in [src/router/index.js](src/router/index.js) for `/items`
- Added a new management screen in [src/views/Items.vue](src/views/Items.vue)
- Added a new item form in [src/components/ItemForm.vue](src/components/ItemForm.vue)
- Added sidebar navigation for Items in [src/components/Sidebar.vue](src/components/Sidebar.vue)
- Added Items to page visibility settings in [src/components/PageVisibilitySettings.vue](src/components/PageVisibilitySettings.vue) and [src/views/Settings.vue](src/views/Settings.vue)

Phase 1 behavior

- Supports `product` and `service` item types
- Supports optional stock tracking
- Supports optional batch tracking
- Supports optional expiry tracking
- Does not change current medicines-based checkout yet
- Does not migrate old medicines data yet

Pending next phases

- Phase 2: allow POS and drafts to accept both medicines and items
- Phase 3: add item-based sales persistence and mixed reporting support
- Phase 4: migrate shared UI from medicine-specific wording to business-neutral wording where safe
- Phase 5: template-specific behavior deferred for now

Notes

- This phase is intentionally parallel-first to avoid breaking live sales behavior.
- `medicines` remains the active source for current checkout until mixed-cart support is added.

## Phase 2: Mixed Checkout and Draft Support

Status: completed on 2026-03-23

Completed

- Updated [src/views/Home.vue](src/views/Home.vue) to search medicines and items from the POS screen
- Added source-aware cart entries in [src/views/Home.vue](src/views/Home.vue) so medicines and items can coexist without ID collisions
- Updated draft save and resume logic in [src/views/Home.vue](src/views/Home.vue) to preserve mixed carts and mixed catalog snapshots
- Updated [src/store/sales.js](src/store/sales.js) to save either `medicine_id` or `item_id` per sale line
- Added mixed inventory deduction and restoration in [src/store/sales.js](src/store/sales.js) for `inventory_batches` and `item_batches`
- Added `item_id` index support for `sale_items` in [src/db/index.js](src/db/index.js)
- Updated sale detail reads in [src/store/sales.js](src/store/sales.js) and [src/views/TransactionHistory.vue](src/views/TransactionHistory.vue) to resolve names from either catalog
- Updated [src/views/Drafts.vue](src/views/Drafts.vue) to use item-neutral wording in the draft detail modal

Phase 2 behavior

- POS can now add both medicines and items to the same sale
- Services and non-stock items skip stock warnings and inventory deduction
- Medicines continue using the existing inventory flow
- Older drafts remain resumable through legacy medicine-map fallback

Pending next phases

- Phase 3: update analytics and reporting queries to aggregate medicines and items together
- Phase 4: migrate more medicine-specific UI wording and detail screens to shared item-based components
- Phase 5: template-specific behavior deferred for now

## Phase 3: Mixed Analytics and Reporting

Status: completed on 2026-03-23

Completed

- Updated [src/views/Analytics.vue](src/views/Analytics.vue) to aggregate both `medicine_id` and `item_id` sale lines
- Updated the top-selling chart in [src/views/Analytics.vue](src/views/Analytics.vue) from medicine-only logic to mixed item logic
- Renamed the analytics chart label from `Top Medicines` to `Top Items` in [src/views/Analytics.vue](src/views/Analytics.vue)
- Updated CSV export rows in [src/store/sales.js](src/store/sales.js) to emit an `items` column containing names from either catalog

Phase 3 behavior

- Analytics totals include mixed medicine and item sales
- Top-selling chart now ranks medicines and items together
- Sales CSV exports use neutral item wording and include mixed sale-line names

Pending next phases

- Phase 4: migrate more medicine-specific UI wording and detail screens to shared item-based components
- Phase 5: template-specific behavior deferred for now

## Phase 4: Item Detail Flow and UI Generalization

Status: completed on 2026-03-23

Completed

- Added [src/views/ItemDetails.vue](src/views/ItemDetails.vue) for the new items catalog detail flow
- Added `/items/:id` route in [src/router/index.js](src/router/index.js)
- Updated [src/views/Items.vue](src/views/Items.vue) with a `View` action and list-state-preserving navigation to item details
- Added item-specific summary cards, inventory mode display, and stock activity history in [src/views/ItemDetails.vue](src/views/ItemDetails.vue)
- Generalized mixed-sale detail labels in [src/views/Sales.vue](src/views/Sales.vue), [src/views/TransactionHistory.vue](src/views/TransactionHistory.vue), and [src/store/sales.js](src/store/sales.js) from medicine-only wording to neutral item display naming
- Started a safe wording pass across [src/components/Sidebar.vue](src/components/Sidebar.vue), [src/views/Settings.vue](src/views/Settings.vue), [src/components/PageVisibilitySettings.vue](src/components/PageVisibilitySettings.vue), [src/views/Home.vue](src/views/Home.vue), [src/views/Medicines.vue](src/views/Medicines.vue), and [src/views/MedicineDetails.vue](src/views/MedicineDetails.vue) to reduce pharmacy-specific titles and navigation text without changing the legacy medicines data flow
- Neutralized the remaining legacy catalog action labels and success/error copy in [src/views/Medicines.vue](src/views/Medicines.vue), [src/components/MedicineForm.vue](src/components/MedicineForm.vue), and [src/views/MedicineDetails.vue](src/views/MedicineDetails.vue), and refreshed [src/views/About.vue](src/views/About.vue) to use broader business-operations wording
- Added [src/utils/legacyMedicineCatalog.js](src/utils/legacyMedicineCatalog.js) as a compatibility layer for legacy medicines labels and titles, and routed [src/router/index.js](src/router/index.js), [src/components/Sidebar.vue](src/components/Sidebar.vue), [src/components/PageVisibilitySettings.vue](src/components/PageVisibilitySettings.vue), [src/views/Settings.vue](src/views/Settings.vue), [src/views/Medicines.vue](src/views/Medicines.vue), [src/components/MedicineForm.vue](src/components/MedicineForm.vue), and [src/views/MedicineDetails.vue](src/views/MedicineDetails.vue) through that layer while preserving the existing medicines store and database schema
- Preserved the existing medicines detail flow in [src/views/MedicineDetails.vue](src/views/MedicineDetails.vue) without risky rewrites

Phase 4 behavior

- Items now have their own detail screen
- Product items show stock activity when stock tracking is enabled
- Service or non-stock items show a clear non-tracked state instead of empty medicine-style inventory assumptions
- Medicines and items now both have dedicated detail flows during the transition period
- Mixed sale modals now label sale lines as items instead of medicines when showing combined catalog data
- Navigation and page titles now use more transitional catalog wording while the legacy medicines module remains available

Pending next phases

- Phase 5: template foundation planning is now defined in [docs/template.md](docs/template.md)

## Phase 5: Template Foundation

Status: planned

Planned rollout

- Phase 5A: template registry and active template setting
- Phase 5B: sari-sari store baseline template
- Phase 5C: pharmacy template rules through config
- Phase 5D: food cart and car wash template rollout
- Phase 5E: repair template extension after shared flows are stable

Phase 5 goals

- Templates remain configurations layered on top of the shared item, POS, customer, and analytics engine
- No separate app forks, databases, or duplicated route trees
- Template behavior is driven by a normalized config contract covering capabilities, workflow rules, defaults, UI visibility, and reporting focus

Reference

- See [docs/template.md](docs/template.md) for the template capability model, schema, and rollout plan

Notes

- Template-specific behavior is intentionally postponed until the shared items foundation has settled further.

## Phase 4.5: Legacy Medicines Removal

Status: completed on 2026-03-23

Completed

- Added a post-open migration in [src/db/index.js](src/db/index.js) that moves legacy `medicines`, `inventory_batches`, `price_history`, old `sale_items`, and draft snapshots into the active `items`, `item_batches`, and `item_price_history` model
- Added `legacy_medicine_id` support in [src/db/index.js](src/db/index.js) so old medicine-linked records can be resolved into migrated items during the transition
- Switched [src/views/Home.vue](src/views/Home.vue), [src/store/sales.js](src/store/sales.js), and [src/views/Analytics.vue](src/views/Analytics.vue) to active item-only runtime behavior
- Removed the legacy medicines Vuex module from [src/store/index.js](src/store/index.js)
- Removed medicine-specific navigation/settings visibility entries from [src/components/Sidebar.vue](src/components/Sidebar.vue), [src/components/PageVisibilitySettings.vue](src/components/PageVisibilitySettings.vue), and [src/views/Settings.vue](src/views/Settings.vue)
- Replaced the old `/medicines` runtime with redirects to `/items` in [src/router/index.js](src/router/index.js)
- Removed legacy medicine-specific UI files and compatibility helper after migration to the unified items flow

Phase 4.5 behavior

- Items are now the single active catalog for CRUD, POS, analytics, drafts, and sale details
- Older medicine records are migrated into items automatically before the app starts using the database
- Older `/medicines` links continue to land on the matching item routes through redirects

Pending next phases

- Phase 5: template-specific behavior deferred for now
