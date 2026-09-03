import "dotenv/config";
import { pool } from "./pool.js";

// Seeds the standardized prices — buy_price (paid to farmers, farmer-
// visible) and sell_price (charged to buyers, buyer-visible/order-costing).
// 2026-08-30 spec: these must differ — the company can't buy and sell at
// the same price and stay solvent. Claude's placeholder: sell_price =
// buy_price × 1.15 (a flat 15% margin) purely so the system isn't zero-
// margin out of the box — this number was never given by the user and
// should be reviewed/adjusted via the admin price editor
// (financeController.js listPrices/updatePrice) before going live.
// Safe to re-run — upserts by crop.
const prices = [
  { crop: "Maize", unit: "bag", buyPrice: 38000 },
  { crop: "Rice (paddy)", unit: "bag", buyPrice: 52000 },
  { crop: "Cassava", unit: "ton", buyPrice: 95000 },
  { crop: "Yam", unit: "tuber", buyPrice: 2500 },
  { crop: "Tomatoes", unit: "crate", buyPrice: 18000 },
  { crop: "Pepper", unit: "basket", buyPrice: 12000 },
];

async function seedPrices() {
  for (const p of prices) {
    const sellPrice = Math.round(p.buyPrice * 1.15);
    await pool.query(
      `INSERT INTO standard_prices (crop, unit, price, buy_price, sell_price, last_reviewed)
       VALUES ($1, $2, $3, $3, $4, CURRENT_DATE)
       ON CONFLICT (crop) DO UPDATE SET unit = $2, buy_price = $3, sell_price = $4, last_reviewed = CURRENT_DATE`,
      [p.crop, p.unit, p.buyPrice, sellPrice]
    );
  }
  console.log(`Seeded ${prices.length} standard prices (buy price + a placeholder 15% sell margin — review before going live).`);
  await pool.end();
}

seedPrices().catch((err) => {
  console.error(err);
  process.exit(1);
});
