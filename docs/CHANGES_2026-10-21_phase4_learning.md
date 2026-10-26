# v27 — Phase 4: learning, quizzes and progress

Goal: a paid corps member opens their courses, works through the lessons, takes each course's quiz and watches
their dashboard percentage rise.

## Founder's decisions
- All lessons must be finished before the quiz unlocks.
- Retakes: unlimited.
- After submitting, show the correct answers and explanations.
- Live sessions can be marked complete only after they start. *(written as a question — built as yes)*
- Shuffle question and answer order on every attempt. *(written as a question — built as yes)*
  Both are one-line switches in `RULES` (`backend/src/utils/corperLearning.js`).

## Rules
- Dashboard % = courses completed / live corps courses. Quiz score never changes it.
- A course is complete when every lesson is done and the quiz was submitted at least once. Permanent once earned.
- Unpaid or refunded: 402 `PAYMENT_REQUIRED` everywhere, progress doesn't count, comes back if they pay again.

## Database (`001_init.sql` §24 — safe to re-run)
`corper_lesson_progress`, `corper_course_progress`, `corper_quiz_attempts`, `corper_quiz_answers`.
No foreign keys to lessons/questions/options so edits and deletes never touch history; every answer keeps a copy
of the question text, the chosen answer, the correct answer and the explanation.

## Backend
- `utils/corperLearning.js` — pure rules (percent, lock, live rule, grading, shuffle, progress summary).
- `controllers/corperLearningController.js` — member endpoints, plus `loadProgressRows()` / `loadMemberProgress()`,
  the one progress query used everywhere.
- Member routes (all behind `requireCorperPaid`): `GET /corpers/courses`, `GET /corpers/progress`,
  `GET /corpers/courses/:id`, `POST .../lessons/:lessonId/complete`, `GET .../lessons/:lessonId/file`,
  `GET .../quiz`, `POST .../quiz/attempts`, `GET .../quiz/attempts`, `GET .../quiz/attempts/:attemptId`.
- Quiz: served without answers or explanations, shuffled; submission is validated (all questions answered, no
  duplicates, questions/options belong to this course and question) and graded only on the server.
- Admin: `GET /rtc/admin/corps/progress` (members table: paid, courses completed, percent; per-course started /
  completed / average best score, paid members only). Approving a corps course when members already have
  progress now needs confirmation (409 `APPROVAL_IMPACT`).
- The old stub `myCorpsCourses` was removed (replaced by `listMyCourses`). Error handler now returns `code` and
  `details` from our own errors.

## Frontend
- My Training: course cards (not started / in progress "2 of 4 lessons" / completed + best score), course page,
  quiz (one question at a time, Submit disabled until all answered), result + review + Retake.
- Dashboard: real progress ring and a Continue learning card.
- Admin: TRC -> Corps now has Payments | Progress sub-tabs; approve shows the confirmation box.

## Edge cases handled
Course added later (percent drops, admin warned) · lesson/question edited or deleted (history intact; a quiz
loaded before an edit is refused, never mis-graded) · double click / two tabs (one attempt, one completion) ·
another member's attempt is "not found" · documents only via the authenticated endpoint (never a public path).

## Honest limits
- "Mark complete" is an honour system (videos and live sessions are on other sites).
- A live lesson with no scheduled time can always be marked complete.
- Spreadsheet export and certificate are phase 5.
