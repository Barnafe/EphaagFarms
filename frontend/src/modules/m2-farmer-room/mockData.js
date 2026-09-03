// Mock data only — replace with real API calls once the backend
// (see the ERDs from Phase 1) is connected.

export const ranks = ["Member", "Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"];

export const farmerProfile = {
  name: "Musa Ibrahim",
  crops: ["Maize", "Cassava"],
  state: "Kaduna",
  lga: "Zaria",
  ward: "Ward 3",
  unit: "Unit 4",
};

export const loanStatus = {
  hasLoan: true,
  amount: 250000,
  repaidAmount: 130000,
};

export const jurisdictionFarmers = [
  { id: "f1", name: "Musa Ibrahim", unit: "Unit 4", attendancePct: 82, loanBound: true },
  { id: "f2", name: "Amaka Obi", unit: "Unit 4", attendancePct: 60, loanBound: false },
  { id: "f3", name: "Yusuf Bello", unit: "Unit 4", attendancePct: 95, loanBound: true },
];
