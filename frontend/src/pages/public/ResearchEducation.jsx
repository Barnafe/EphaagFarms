import PublicContentBrowser from "../../components/PublicContentBrowser.jsx";
import { seminars, courses } from "../../data/researchEducationContent.js";

export default function ResearchEducation() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-medium text-ink-900">Training & Consultancy</h1>

      <div className="mt-8">
        <PublicContentBrowser seminars={seminars} courses={courses} />
      </div>
    </div>
  );
}
