// Mock data only — replace with real API calls once the backend is connected.
// Content (seminars/courses/research) mirrors what TRC Department publishes —
// mocked independently for now since there's no shared backend yet.

export const seminars = [
  { id: "s1", title: "Modern maize spacing techniques", date: "2026-08-14", location: "Kaduna Unit 4 hall" },
  { id: "s2", title: "Post-harvest storage best practices", date: "2026-08-28", location: "Kano Ward 2 hall" },
];

export const courses = [
  { id: "c1", title: "Introduction to soil testing", description: "A short video course on reading and acting on soil test results." },
  { id: "c2", title: "Record-keeping for smallholder farms", description: "Simple record-keeping habits that improve loan eligibility." },
];

export const research = [
  { id: "r1", title: "Soil health trends across the North-West", summary: "Findings from this year's field surveys on soil nutrient depletion." },
];

export const consultancy = [
  { id: "cn1", title: "Farm planning consultation", description: "One-on-one guidance for farmers planning a new planting season." },
];

export const myEducation = {
  attendancePct: 82,
  coursePct: 70,
  attendanceHistory: [
    { seminarTitle: "Fertilizer application timing", date: "2026-06-02", attended: true },
    { seminarTitle: "Irrigation on a budget", date: "2026-06-20", attended: false },
  ],
  courseProgress: [
    { courseTitle: "Introduction to soil testing", completed: true },
    { courseTitle: "Record-keeping for smallholder farms", completed: false },
  ],
};

// Unit Leader's jurisdiction — used for the attendance marking flow
export const jurisdictionMembers = [
  { id: "f1", name: "Musa Ibrahim" },
  { id: "f2", name: "Amaka Obi" },
  { id: "f3", name: "Yusuf Bello" },
  { id: "f4", name: "Grace Danladi" },
];
