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

## Phase 5: Template Foundation and Initial Runtime Wiring

Status: completed on 2026-03-24 to 2026-03-25

Completed

- Added a shared template registry in [src/templates/registry.js](src/templates/registry.js) covering Generic, Sari-sari Store, Pharmacy, Food Cart, Car Wash, and Repair Shop
- Added shared page definitions and template page visibility mapping in [src/templates/pages.js](src/templates/pages.js)
- Added template preference persistence in [src/utils/templatePreferences.js](src/utils/templatePreferences.js) for active template selection and resolved template overrides
- Added onboarding completion persistence in [src/utils/onboardingPreferences.js](src/utils/onboardingPreferences.js)
- Added a Vuex template module in [src/store/template.js](src/store/template.js) and registered it in [src/store/index.js](src/store/index.js)
- Initialized the active template during startup in [src/main.js](src/main.js)
- Updated route visibility fallback in [src/router/index.js](src/router/index.js) to use effective template page defaults
- Updated navigation and page visibility controls in [src/components/Sidebar.vue](src/components/Sidebar.vue) and [src/components/PageVisibilitySettings.vue](src/components/PageVisibilitySettings.vue) to respect template-driven defaults
- Updated [src/components/ItemForm.vue](src/components/ItemForm.vue) so new items inherit active template defaults and enforce template-driven product/service and stock-tracking rules
- Updated [src/views/Home.vue](src/views/Home.vue) so POS catalog search and add-to-cart behavior respect template-driven product/service availability
- Added template-aware POS search wording in [src/views/Home.vue](src/views/Home.vue) for placeholder and no-results states
- Removed the unused Inventory page from [src/router/index.js](src/router/index.js), [src/templates/pages.js](src/templates/pages.js), and [src/views/Inventory.vue](src/views/Inventory.vue)

Phase 5 behavior

- Templates now exist as runtime configuration objects instead of planning-only documentation
- The app now persists an active template and resolved overrides in app settings
- New items inherit template defaults for item type and stock behavior
- Product and service availability can now be constrained by the active template in item creation and POS search
- Page visibility defaults now come from the active template before user overrides are applied

Reference

- See [docs/template.md](docs/template.md) for the template capability model, schema, and rollout plan

## Phase 6: First-Run Setup and Template Profile Editing

Status: completed on 2026-03-24 to 2026-03-25

Completed

- Added a first-run setup route and onboarding redirect in [src/router/index.js](src/router/index.js)
- Added the onboarding UI in [src/views/Setup.vue](src/views/Setup.vue)
- Implemented setup steps for business name, template selection, quick customization, and review in [src/views/Setup.vue](src/views/Setup.vue)
- Persisted onboarding completion state in [src/utils/onboardingPreferences.js](src/utils/onboardingPreferences.js)
- Persisted active template overrides from setup in [src/utils/templatePreferences.js](src/utils/templatePreferences.js) and [src/store/template.js](src/store/template.js)
- Hid the sidebar during setup in [src/App.vue](src/App.vue)
- Added a Template Profile section to [src/views/Settings.vue](src/views/Settings.vue) with `Edit Template Profile` and `Rerun Setup` actions
- Added a safe rerun-setup flow in [src/views/Settings.vue](src/views/Settings.vue) so onboarding can be reopened for retesting or profile edits
- Improved setup UX in [src/views/Setup.vue](src/views/Setup.vue) with a multi-step progress bar, service-only customization behavior, page visibility state indicators, and overflow-safe review cards

Phase 6 behavior

- First launch now routes through setup until onboarding is completed
- Users can choose a premade template or Generic during onboarding
- Users can apply lightweight template customizations before entering the app
- Users can reopen setup later from Settings to retest or revise the template profile

## Phase 7: Template-Driven Checkout, Customer Rules, and Sales Presentation

Status: completed on 2026-03-25

Completed

- Extended [src/views/Setup.vue](src/views/Setup.vue) so setup now captures payment-method availability and customer-selection requirements alongside loyalty toggles
- Updated [src/views/Home.vue](src/views/Home.vue) so checkout summary copy, customer visibility, professional fee visibility, and payment labels follow the active template
- Added shared template presentation helpers in [src/utils/templatePresentation.js](src/utils/templatePresentation.js) for loyalty gating, customer requirements, payment labels, and professional fee labels
- Updated [src/templates/pages.js](src/templates/pages.js) so Customers is hidden by default when the active template does not need loyalty and does not require customer selection
- Updated [src/views/Customers.vue](src/views/Customers.vue) so points sorting, columns, and manual point adjustments are hidden when loyalty is off while keeping customer records usable when customer selection is still required
- Updated [src/views/TransactionHistory.vue](src/views/TransactionHistory.vue) so loyalty-off templates default to purchase history, hide points-only tabs and summaries, and use template-aware sale labels in the detail modal
- Updated [src/views/Sales.vue](src/views/Sales.vue) and [src/store/sales.js](src/store/sales.js) so sales history and CSV export use template-aware payment and professional fee labels
- Updated [src/views/Drafts.vue](src/views/Drafts.vue) so saved drafts now use template-aware item, customer, payment, and fee labels in both the list and detail modal
- Updated [src/views/Setup.vue](src/views/Setup.vue), [src/views/Settings.vue](src/views/Settings.vue), [src/views/Home.vue](src/views/Home.vue), and [src/views/Analytics.vue](src/views/Analytics.vue) so template profiles can now set a daily sales quota and customer-points multiplier from setup or settings, with checkout redemption and analytics quota displays following those saved values
- Updated [src/utils/templatePreferences.js](src/utils/templatePreferences.js) and [src/store/template.js](src/store/template.js) so template-profile saves now normalize overrides into plain serializable data before storing them in IndexedDB, fixing the Settings save failure caused by reactive objects reaching persistence
- Expanded [src/views/Settings.vue](src/views/Settings.vue) so template profiles can now directly edit catalog, customer, fee, and payment terminology without rerunning setup
- Updated [src/views/Analytics.vue](src/views/Analytics.vue) so reporting focus now changes which metrics and top-selling chart emphasis are shown for mixed, sales, inventory, and services templates
- Updated [src/views/Sales.vue](src/views/Sales.vue) and [src/views/TransactionHistory.vue](src/views/TransactionHistory.vue) so sale-detail history modals now use template-aware catalog terminology for item columns and empty states

Phase 7 behavior

- Setup now controls whether customers are optional or required and which payment methods appear in POS
- Customers is no longer shown by default for templates that do not use loyalty and do not require customer tracking
- Customer records can still be exposed manually from page visibility settings without re-enabling loyalty features
- Loyalty-off templates now show customer history as purchase-first instead of points-first
- Sales detail surfaces and exports now use the same payment and fee terminology as the active template
- Draft history now follows active template terminology for item, customer, payment, and additional-fee labels
- Template profiles can now directly control the analytics daily sales quota and the peso value of each redeemed customer point from setup or settings
- Template profile changes made from Settings now persist reliably without IndexedDB clone errors
- Template terminology can now be revised directly from Settings for catalog labels, customer wording, payment labels, and fee labels
- Analytics now adapts its metric emphasis and top-selling chart based on the active template reporting focus
- Sales history and customer transaction-history detail modals now follow the active template's catalog terminology more consistently

Pending next phases

- Multi-business support remains deferred
- Combined analytics remains deferred

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

## Phase 8: Settings-Only About Access

Status: completed on 2026-03-25

Completed

- Added an About link in the lowest section of [src/views/Settings.vue](src/views/Settings.vue)
- Removed About from template-managed navigation in [src/templates/pages.js](src/templates/pages.js)
- Removed About from template page defaults in [src/templates/registry.js](src/templates/registry.js)

Phase 8 behavior

- About is now accessible from Settings instead of the main sidebar

## Phase 9: Item Expiration Notifications

Status: completed on 2026-03-25

Completed

- Added shared expiry alert utilities in [src/utils/expiryAlerts.js](src/utils/expiryAlerts.js) for near-expiry, urgent-expiry, expired-stock, and sellable-quantity calculations
- Updated [src/templates/registry.js](src/templates/registry.js), [src/views/Setup.vue](src/views/Setup.vue), [src/views/Settings.vue](src/views/Settings.vue), and [src/utils/templatePresentation.js](src/utils/templatePresentation.js) so template profiles now define configurable near-expiry and urgent-expiry windows
- Updated [src/store/items.js](src/store/items.js) and [src/views/Home.vue](src/views/Home.vue) so expired tracked batches no longer count as sellable stock in item lists or POS search results
- Updated [src/store/sales.js](src/store/sales.js) so checkout inventory deduction avoids consuming expired tracked batches and falls back to negative inventory without mutating unusable stock
- Updated [src/views/Items.vue](src/views/Items.vue) and [src/views/ItemDetails.vue](src/views/ItemDetails.vue) to surface expiry alert badges, summaries, and batch-level expiry visibility in inventory screens
- Updated [src/views/Analytics.vue](src/views/Analytics.vue) to show expiry-health counts and highlighted items that are expired, urgent, or near expiry

Phase 9 behavior

- Tracked expiry inventory now distinguishes sellable stock from expired stock
- Inventory screens now show which items are expired, urgently expiring, or approaching expiry
- POS search and checkout now respect expired tracked batches instead of treating them as available stock
- Businesses can tune the warning and urgent expiry windows from setup or settings without code changes

- About is still available through its route
- About no longer appears in the sidebar
- About no longer appears in page visibility or template-managed navigation
- Settings is now the intended entry point for About

## Remaining Backlog

- Multi-business support
- Separate operational database per business
- Cross-business combined analytics
