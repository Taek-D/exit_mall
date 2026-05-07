# Exit Mall Project

Last updated: 2026-05-07

## What This Is

Exit Mall is a deposit-based closed B2B marketplace with an admin backoffice.
Approved buyers place orders using prepaid deposit balance, and operators manage
approvals, deposits, products, orders, users, and shipping status.

## Current Stack

- Next.js 14 App Router, React 18, TypeScript
- Tailwind CSS, shadcn/ui, lucide-react
- Supabase Auth, Postgres, RLS, Realtime, Storage
- Server Actions and Route Handlers for backend behavior
- Vitest for unit tests, Playwright reserved for E2E

## Current Milestone: v1.1 CJ대한통운 배송조회 연결

**Goal:** Let buyers and admins fetch CJ대한통운 delivery status from the app using stored carrier and tracking number data.

**Target features:**
- Buyer can manually look up CJ대한통운 tracking status from `/orders`.
- Admin can manually look up CJ대한통운 tracking status from `/admin/orders/[id]`.
- The system uses CJ대한통운 official endpoints and exposes only non-sensitive tracking fields.
- Non-CJ carriers continue to use the existing external tracking-link behavior.

## Validated Capabilities

- Approved users can browse products, place orders, view orders, request deposits, and cancel eligible placed orders.
- Admins can approve users, confirm deposits, manage products, transition order status, enter carrier and tracking number, export orders, and inspect user accounts.
- Orders already store `carrier` and `tracking_number`, and existing UI can build public tracking URLs.

## Key Decisions

- Delivery lookup v1 uses a carrier adapter shape but only implements `cj`.
- Lookup is button-triggered, not automatic.
- Lookup results are not cached in the database.
- CJ delivery status never automatically transitions the internal order status to `delivered`.

## Evolution

This document evolves at milestone boundaries and after major phase transitions.

1. Requirements invalidated? Move to out of scope with reason.
2. Requirements validated? Move to validated capabilities with phase reference.
3. New requirements emerged? Add to active requirements.
4. Decisions to log? Add to key decisions.
5. "What This Is" still accurate? Update if the product meaning drifts.
