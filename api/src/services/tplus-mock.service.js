/**
 * EXAMPLE / MOCK data for the TPLUS service pages (Register E-SIM, Confirm Nice
 * Number, Approve Add/Delete Number, Import IMSI). These stand in for the real
 * telecom APIs — the same ones the legacy PHP app on 10.30.6.94:7878 talks to —
 * until those are wired. Every function here returns sample data or a canned
 * success so the UI and the activity-logging can be built and tested now.
 *
 * ⚠️  Replace the bodies of these functions with real API calls later; the
 *     controllers and the frontend never need to change.
 */

/** A deterministic pseudo-random helper so the sample lists stay stable per run. */
let seed = 42;
function rnd(max) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % max;
}

/** Build a fake IMSI (457-08 prefix, like the screenshots) + its QR payload. */
export function nextEsim() {
  const imsi = `457080110${String(440000 + rnd(60000)).padStart(6, '0')}`;
  // The QR for an eSIM is an LPA activation string; this is a sample shape.
  const qr = `LPA:1$smdp.tplus.la$${imsi}-${String(rnd(999999)).padStart(6, '0')}`;
  return { imsi, qr };
}

/** Action options for the Register E-SIM dropdown (matches the legacy PHP app). */
export const ESIM_ACTIONS = ['New Number', 'Old Number', 'Check IMSI'];

const CUSTOMER = 'selldepartment';
const BOOKING_BY = 'webnicenumber';
const BUY_TYPES = ['prepaid', 'postpaid'];
const NICE_PRICES = [60000, 150000, 300000];

/** Pending "nice numbers" waiting to be confirmed (sample rows). */
export function niceNumbers(search = '') {
  const rows = Array.from({ length: 14 }, (_, i) => ({
    id: 1000 + i,
    customerName: CUSTOMER,
    msisdn: `207${String(8000000 + rnd(900000)).padStart(7, '0')}`,
    price: NICE_PRICES[rnd(NICE_PRICES.length)],
    buyType: BUY_TYPES[rnd(2)],
    confirmDate: null,
    bookingBy: BOOKING_BY,
  }));
  const q = search.trim();
  return q ? rows.filter((r) => r.msisdn.includes(q)) : rows;
}

/** Pool numbers awaiting add/delete approval (sample rows). */
export function poolNumbers({ search = '' } = {}) {
  const rows = Array.from({ length: 16 }, (_, i) => {
    const price = [20000, 60000, 150000][rnd(3)];
    return {
      id: 2000 + i,
      msisdn: `207${String(6100000 + i * 73).padStart(7, '0')}`,
      prepaidPrice: price,
      postpaidPrice: price,
    };
  });
  let out = rows;
  const q = search.trim();
  if (q) out = out.filter((r) => r.msisdn.includes(q));
  return out;
}
