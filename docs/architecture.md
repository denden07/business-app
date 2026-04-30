/*
PROJECT CONTEXT

This project is a mobile-first business companion app built using:
- Vue 3 (script setup)
- Vuex
- IndexedDB (idb)
- Capacitor (mobile app, landscape-first UI)

The app was originally a pharmacy POS system, but is now being refactored into a generic system that supports multiple small business types.

TARGET USERS:
- Small business owners (Philippines initially)
- Examples: sari-sari store, pharmacy, food vendor, motorcycle repair shop, car wash, small clothes shop, services business etc.

APP GOAL:
To provide a modular business tool that includes:
- POS (sales)
- Inventory
- CRM (customers & loyalty)
- Analytics
- (Future) Cloud backup

----------------------------------------

CURRENT STATE

The app currently has:
- medicines (product-based inventory)
- inventory_batches (with expiry tracking)
- sales and sale_items
- customers and loyalty system

The POS flow is already working and must NOT be broken.

----------------------------------------

CURRENT OBJECTIVE (IMPORTANT)

We are refactoring the app to:

1. Replace "medicines" with a generic "items" system
2. Support both:
   - products (with stock)
   - services (no stock)
3. Make inventory flexible:
   - optional batch tracking
   - optional expiry tracking
4. Prepare the system for multiple business templates

----------------------------------------

REFACTORING RULES (CRITICAL)

- DO NOT break existing POS functionality
- DO NOT delete medicines yet
- Maintain backward compatibility during migration
- Refactor incrementally (step-by-step)
- Preserve existing sales and inventory data

----------------------------------------

DATA DESIGN GOALS

The new "items" system should:
- Be flexible for different business types
- Support:
  - stock tracking (optional)
  - batch tracking (optional)
  - expiry tracking (optional)
- Allow service-type items (no inventory)

----------------------------------------

SELLING OPTIONS FLOW

- Base items remain the source of truth for inventory and expiry-aware stock.
- Optional selling configurations such as bundle and wholesale are attached to the base item through `item_sale_options`.
- These selling options are managed from the item detail page rather than the add-item modal.
- A selling option defines:
   - label / type
   - selling price
   - unit quantity in base pieces
- POS and sale persistence always convert the chosen selling option back into base pieces before deducting `item_batches`.
- This keeps bundle and wholesale selling compatible with the current expiry exclusion logic, because expired pieces are still filtered out at the batch level.

----------------------------------------

FUTURE DIRECTION

After inventory refactor, the app will support:

1. Template system
   - Each business type configures behavior
   - Example templates:
     - pharmacy
     - sari-sari store
     - food vendor
     - repair shop
     - car wash

2. Budgeting feature
   - Track expenses
   - Integrate with analytics
   - Compute profit (sales - expenses)

3. Cloud backup (optional paid feature)

----------------------------------------

CODING STYLE

- Use simple, readable code
- Avoid overengineering
- Follow existing project patterns
- Use Composition API
- Keep functions modular and reusable

----------------------------------------

TASK INSTRUCTION FORMAT

When generating code:
- Always preserve existing behavior
- Consider edge cases
- Ensure compatibility with current database
- Prefer incremental refactoring over full rewrites
*/