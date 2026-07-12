// Production Hardening Phase 11 — drives real HTTP load against
// POST /api/public/checkout/:cartId/place-order (the checkout hot path:
// idempotency-key reservation, the Order/OrderItem/Fulfillment
// transaction, OutboxEvent writes), one request per pre-seeded cart
// (seed-load-test-data.ts) so every request is a genuine first-time
// checkout, not a repeat hit against an already-converted cart.
//
// For the horizontal scale-out scenario (master spec Phase 11 work item
// 2), run-load-test.sh launches this script once per server instance,
// each pointed at a disjoint MANIFEST_OFFSET/MANIFEST_COUNT slice of the
// same seeded cart pool and its own BASE_URL — approximating a real load
// balancer's traffic split without needing an actual one in this
// sandbox, while both instances share the same Postgres/Redis exactly
// like a real horizontally-scaled deployment would.
//
// Usage:
//   BASE_URL=http://localhost:4000 node checkout-load-test.mjs
//   BASE_URL=http://localhost:4001 MANIFEST_OFFSET=250 MANIFEST_COUNT=250 CONNECTIONS=25 node checkout-load-test.mjs
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fullManifest = JSON.parse(readFileSync(path.join(__dirname, "manifest.json"), "utf8"));

const baseUrl = process.env.BASE_URL ?? "http://localhost:4000";
const connections = Number(process.env.CONNECTIONS ?? 20);
const offset = Number(process.env.MANIFEST_OFFSET ?? 0);
const count = Number(process.env.MANIFEST_COUNT ?? fullManifest.length - offset);
const manifest = fullManifest.slice(offset, offset + count);
const resultsPath = process.env.RESULTS_PATH ?? null;

if (manifest.length === 0) {
  console.error(`Manifest slice is empty (offset=${offset}, count=${count}, total=${fullManifest.length}) -- run seed-load-test-data.ts first`);
  process.exit(1);
}

let counter = 0;

const instance = autocannon(
  {
    url: baseUrl,
    connections,
    amount: manifest.length,
    requests: [
      {
        method: "POST",
        setupRequest: (req) => {
          const entry = manifest[counter++];
          req.path = `/api/public/checkout/${entry.cartId}/place-order`;
          req.headers = {
            "content-type": "application/json",
            cookie: `guest_session_id=${entry.guestSessionId}`,
            "idempotency-key": randomUUID(),
          };
          req.body = JSON.stringify({
            tipCents: 0,
            methodType: "CASH_ON_DELIVERY",
            guestEmail: "loadtest@example.test",
            guestName: "Load Test Customer",
          });
          return req;
        },
      },
    ],
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exitCode = 1;
      return;
    }
    const summary = {
      baseUrl,
      manifestSlice: { offset, count: manifest.length },
      title: result.title,
      duration: result.duration,
      requests: result.requests,
      latency: result.latency,
      throughput: result.throughput,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      statusCodeDistribution: result.statusCodeStats,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (resultsPath) {
      writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
    }
  },
);

autocannon.track(instance, { renderProgressBar: false });
