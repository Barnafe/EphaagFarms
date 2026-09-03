// Mock data only — replace with real API calls once the backend is connected.

export const myProfile = {
  attendancePct: 82,
  coursePct: 70,
};

export const eligibilityThreshold = {
  attendancePct: 75,
  coursePct: 60,
};

export const myLoan = {
  status: "active", // "none" | "pending" | "recommended" | "rejected" | "active"
  reference: "LN-20260410-B7T1",
  loanType: "interest", // "aid" | "interest"
  amount: 250000,
  interestRate: 5, // percent, only relevant for "interest" type
  repayments: [
    { id: "r1", date: "2026-04-10", amount: 40000, method: "Bank transfer" },
    { id: "r2", date: "2026-05-12", amount: 45000, method: "Bank transfer" },
    { id: "r3", date: "2026-06-14", amount: 45000, method: "Bank transfer" },
  ],
  rejectionReason: null,
  reapplyAfter: null,
};

export const pendingApplications = [
  {
    id: "app1",
    farmerName: "Musa Ibrahim",
    loanType: "aid",
    amount: 150000,
    attendancePct: 88,
    coursePct: 65,
    status: "pending", // Unit Leader hasn't acted yet
  },
  {
    id: "app2",
    farmerName: "Amaka Obi",
    loanType: "interest",
    amount: 300000,
    attendancePct: 55,
    coursePct: 40,
    status: "pending",
  },
];

export const recommendedApplications = [
  {
    id: "app3",
    farmerName: "Yusuf Bello",
    loanType: "interest",
    amount: 200000,
    recommendedBy: "Unit Leader — Unit 4",
    status: "recommended", // waiting on Federal/CEO
  },
];
