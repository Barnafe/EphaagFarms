import PublicContentBrowser from "../../components/PublicContentBrowser.jsx";
import { seminars, courses, research, consultancy } from "../../data/researchEducationContent.js";

export default function ResearchEducation() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-medium text-ink-900">Research, Training & Consultancy</h1>
      <p className="mt-3 text-ink-600">
        Free seminars, online courses, and research, open to everyone — no account
        needed to browse. Seminar attendance and course progress build into every
        farmer's dashboard automatically once you're registered.
      </p>

      <div className="mt-8">
        <PublicContentBrowser seminars={seminars} courses={courses} research={research} consultancy={consultancy} />
      </div>
    </div>
  );
}
