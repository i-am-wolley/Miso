// Admin-only report: AI usage/cost per household, read from households/{code}/aiQuota/{date}.
// Requires scripts/serviceAccountKey.json (git-ignored) — Firebase Console > Project settings
// > Service accounts > Generate new private key.
//
// Usage:
//   node scripts/ai-usage-report.js            totals per household + grand total
//   node scripts/ai-usage-report.js --detail   also prints per-day breakdown per household

const path = require("path");
const admin = require("firebase-admin");

const keyPath = path.join(__dirname, "serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = require(keyPath);
} catch (e) {
  console.error("Missing " + keyPath);
  console.error("Download one from Firebase Console > Project settings > Service accounts > Generate new private key,");
  console.error("save it as scripts/serviceAccountKey.json, then re-run this script.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function pad(v, width) { return String(v).padStart(width); }
function money(v) { return "$" + v.toFixed(4); }

async function main() {
  const householdsSnap = await db.collection("households").get();
  const rows = [];
  const grand = { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for (const hhDoc of householdsSnap.docs) {
    const quotaSnap = await hhDoc.ref.collection("aiQuota").get();
    const hh = { code: hhDoc.id, count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, days: [] };
    quotaSnap.forEach(function (dayDoc) {
      const d = dayDoc.data();
      const count = d.count || 0;
      const inputTokens = d.inputTokens || 0;
      const outputTokens = d.outputTokens || 0;
      const costUsd = d.costUsd || 0;
      hh.count += count;
      hh.inputTokens += inputTokens;
      hh.outputTokens += outputTokens;
      hh.costUsd += costUsd;
      hh.days.push({ date: dayDoc.id, count: count, inputTokens: inputTokens, outputTokens: outputTokens, costUsd: costUsd });
    });
    hh.days.sort(function (a, b) { return a.date.localeCompare(b.date); });
    rows.push(hh);
    grand.count += hh.count;
    grand.inputTokens += hh.inputTokens;
    grand.outputTokens += hh.outputTokens;
    grand.costUsd += hh.costUsd;
  }

  rows.sort(function (a, b) { return b.costUsd - a.costUsd; });

  console.log("\n=== AI usage report — pantry-os-prod ===");
  console.log("Households: " + rows.length + "\n");
  console.log(
    "Household".padEnd(22) + pad("Requests", 10) + pad("In tok", 10) + pad("Out tok", 10) + pad("Cost", 10)
  );
  rows.forEach(function (hh) {
    console.log(
      hh.code.padEnd(22) + pad(hh.count, 10) + pad(hh.inputTokens, 10) + pad(hh.outputTokens, 10) + pad(money(hh.costUsd), 10)
    );
  });
  console.log("-".repeat(62));
  console.log(
    "TOTAL".padEnd(22) + pad(grand.count, 10) + pad(grand.inputTokens, 10) + pad(grand.outputTokens, 10) + pad(money(grand.costUsd), 10)
  );

  if (process.argv.includes("--detail")) {
    console.log("\n--- Per-day breakdown ---");
    rows.forEach(function (hh) {
      console.log("\n" + hh.code + ":");
      hh.days.forEach(function (d) {
        console.log(
          "  " + d.date + "  req=" + pad(d.count, 3) + "  in=" + pad(d.inputTokens, 7) + "  out=" + pad(d.outputTokens, 7) + "  " + money(d.costUsd)
        );
      });
    });
  }

  process.exit(0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
