-- Phase 13: corps lessons are no longer an honour system for videos and documents.
-- A video counts when most of it was really watched, a document when it was open for a minimum time.
-- Live sessions are unchanged (the member taps complete once the session has started).
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS duration_seconds INT;   -- length of a video, entered by the admin
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS min_seconds INT;        -- minimum time a document must be open

-- Time really spent on one lesson by one member. Like the rest of the member's history it has no foreign key on the lesson,
-- so editing or deleting a lesson never rewrites what a member already did.
CREATE TABLE IF NOT EXISTS corper_lesson_activity (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  seconds_counted NUMERIC(10,2) NOT NULL DEFAULT 0,
  reported_duration INT,
  last_beat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS corper_lesson_activity_course_idx ON corper_lesson_activity (course_id, user_id);
