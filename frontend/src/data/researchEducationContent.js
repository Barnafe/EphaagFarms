// Static content for the public /research-education page. Not wired to a
// backend — seminars/courses here are separate from the real, live RTC
// courses system (Farmer's Room's "Seminal"/"RTC" tab, admin-trc-department),
// this is just marketing copy for visitors browsing before they register.

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
