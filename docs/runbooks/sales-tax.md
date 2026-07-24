# Sales Tax

How OrderVora calculates sales tax today (pilot), how to configure it, and the
lowest-churn path to Stripe Tax later.

## 1. How tax works today

Tax is **rule-based** and per-restaurant. Each `Tax` row is `{ restaurantId,
jurisdiction, rateBasisPoints, appliesTo (FOOD | DELIVERY_FEE | ALL), isActive }`.
At checkout, `quote.service.ts` loads a restaurant's active rules and calls one
pure function, `computeTaxCents(taxRules, subtotalCents, deliveryFeeCents)`
(`apps/api/src/modules/commerce/checkout/tax.ts`), which sums each active rule
against the portion it applies to. The result is frozen onto `Order.taxCents`
and never recomputed if a rule changes later.

**This is deliberately simple and correct for a single-jurisdiction pilot.** It
does no jurisdiction resolution from the delivery address, no product-level tax
codes, and no nexus tracking — those are Stripe Tax's job (§3).

The entire tax surface is two lines in `quote.service.ts`:

- the `prisma.tax.findMany({ where: { restaurantId } })` that loads the rules, and
- the `computeTaxCents(...)` call.

That single, isolated seam is what makes the Stripe Tax migration (§3) small.

## 2. Configuring tax for the pilot

There is intentionally **no owner-facing tax-management UI** — for a
single-jurisdiction pilot a flat rate is sufficient, and multi-jurisdiction
automation is Stripe Tax's job, so building CRUD now would be throwaway work.
The operator sets a restaurant's rate with a script:

```bash
pnpm --filter api exec tsx scripts/set-restaurant-tax.ts <restaurantId> <ratePercent> <jurisdiction> [FOOD|DELIVERY_FEE|ALL]

# New York City combined rate on the whole order (food + delivery fee):
pnpm --filter api exec tsx scripts/set-restaurant-tax.ts 66816e97-... 8.875 "New York, NY" ALL
```

Backed by `setRestaurantSalesTax()`
(`apps/api/src/modules/commerce/checkout/tax-config.service.ts`):

- **Idempotent** — re-running replaces the rule for the *same* basis, so a rate
  can be corrected safely without stacking duplicates. Rules for other bases are
  untouched.
- **`appliesTo`** — `ALL` (default) taxes subtotal + delivery fee; `FOOD` taxes
  only the subtotal; `DELIVERY_FEE` only the fee. Use `FOOD` where prepared food
  and delivery are taxed differently.
- **Precision** — rates are stored as integer basis points (0.01% precision). A
  rate finer than 0.01% is rounded to the nearest 0.01% (e.g. 8.875% → 888 bp =
  8.88%). At pilot order sizes this is a sub-cent difference; Stripe Tax's exact
  rates supersede it later.

**Verified** (2026-07-24, local PostgreSQL): setting 8.875% ALL produced 888 bp,
was idempotent (one rule after two runs), and `computeTaxCents` then returned
$2.66 on a $30.00 order, $1.86 on $15.95 + $4.99 delivery, and $8.88 on $100.00
— i.e. the configured rate flows correctly through the real checkout quote.

### Pilot checklist per restaurant

1. Confirm the restaurant's correct combined state+local rate and whether
   prepared food / delivery are taxed the same (many states differ — set `FOOD`
   vs `DELIVERY_FEE` rules accordingly).
2. Run the script; verify the stored rule and a sample quote.
3. This is the operator's legal responsibility to get right for the pilot
   jurisdiction — the platform provides the mechanism, not tax advice.

## 3. Migrating to Stripe Tax later (lowest-churn path)

**Recommendation: do not migrate yet, and do not pre-build the abstraction.** The
current single-call-site design means Stripe Tax can be introduced in one
focused change when it's actually needed — building a provider abstraction now
would be speculative. Migrate when any of these becomes true: the platform
serves multiple tax jurisdictions, a merchant has nexus in states that require
precise/looked-up rates, or manual rate upkeep stops being reliable.

### The seam

Only the two lines in §1 change. Everything downstream is already
provider-agnostic: `Order.taxCents` is a frozen integer, and the quote shape
doesn't care how the number was produced. When the time comes, introduce a
`TaxCalculator` interface with two implementations, gated by a `TAX_PROVIDER`
env var (`rules` | `stripe`), mirroring the existing payment/fulfillment
provider-registry pattern:

- `RuleBasedTaxCalculator` — today's `computeTaxCents` behind the interface (the
  permanent fallback).
- `StripeTaxCalculator` — calls Stripe Tax.

`quote.service.ts` calls `taxCalculator.calculate(context)` where `context` is
everything already available at that point.

### What Stripe Tax needs — and what we already have

Already available at the call site: order line amounts, the restaurant's origin
address, and (for delivery) the customer's delivery address for jurisdiction
resolution. So no new data has to be threaded through to adopt it.

New, but **operational, not code**:

- **Product tax codes** (e.g. prepared food vs. general goods) per menu item or
  a sensible default — Stripe Tax uses these to pick the right rate.
- **Tax registrations / nexus** per state, configured by the merchant in their
  own Stripe dashboard.

### BYOP nuance (important)

Payments are BYOP — each restaurant uses **its own** Stripe account (not a
platform Connect account). So Stripe Tax runs under the *merchant's* Stripe
account: the merchant enables Stripe Tax and adds its registrations in its own
dashboard, and `StripeTaxCalculator` calls the Tax API with that merchant's
key (already stored, encrypted, per `PaymentProvider`). This is a per-merchant
enablement, not a one-time platform switch.

### Mechanics

- Quote: `stripe.tax.calculations.create({...})` returns the tax amount → use it
  as `taxCents`.
- On successful payment: record a `stripe.tax.transactions` entry (from the
  calculation) so the amount is filed/reportable. Optionally persist the Stripe
  tax calculation/transaction id for reconciliation — a **nullable, additive**
  column on `Order`, no destructive migration.

### Rollout discipline

Flag-gated, and **shadow-compare first**: compute both the rule-based and Stripe
amounts, log divergences on real traffic for a period, then cut over per
restaurant once they agree within tolerance. Keep `RuleBasedTaxCalculator` as
the fallback if the Tax API is unavailable, so a Stripe outage never blocks
checkout.

### Cost / correctness note

Stripe Tax is billed per calculation. Its value is correctness and filing
automation across many jurisdictions — which is exactly why it isn't worth it
for a one-jurisdiction pilot, and is worth it once jurisdictions multiply. The
plan's own guidance (manual tax is a launch risk) is satisfied for the pilot by
configuring the correct single-jurisdiction rate above, and closed permanently
by this migration when scale warrants it.
