// Mock data only — replace with real API calls once the backend is connected.
// Each queue here mirrors data owned by another module (Buyer's Room, Loan
// Office, order delivery status) — mocked independently for now since
// there's no shared backend yet.

export const paymentConfirmations = [
  {
    id: "pc1",
    orderReference: "ORD-20260722-K3P9",
    buyerName: "Coastal Foods Ltd",
    amount: 1140000,
    status: "pending", // "pending" | "confirmed"
  },
];

export const loanDisbursements = [
  {
    id: "ld1",
    loanReference: "LN-20260715-P2Q8",
    farmerName: "Grace Danladi",
    loanType: "aid",
    amount: 150000,
    status: "approved", // "approved" | "disbursed"
  },
];

export const repaymentReconciliation = [
  {
    id: "rr1",
    loanReference: "LN-20260410-B7T1",
    farmerName: "Musa Ibrahim",
    amount: 45000,
    date: "2026-06-14",
    method: "Bank transfer",
    status: "unverified", // "unverified" | "verified"
  },
];

export const settlements = [
  {
    id: "st1",
    orderReference: "ORD-20260520-7QX2",
    farmerPayout: { farmerName: "Musa Ibrahim", amount: 700000, status: "unpaid" },
    processorFee: { name: "Kaduna Processing Co.", amount: 30000, status: "unpaid" },
    transporterFee: { name: "Ibrahim Sule", amount: 30000, status: "unpaid" },
  },
];


