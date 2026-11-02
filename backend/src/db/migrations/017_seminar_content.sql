-- 017: Seminar topics for farmers are made of videos and slides. The system marks
-- each one complete (video watched to the end, last slide reached) and marks the
-- whole topic complete once every item is done. Safe to run on every boot.
CREATE TABLE IF NOT EXISTS seminar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','slides')),
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seminar_items_course_idx ON seminar_items (course_id, position);

CREATE TABLE IF NOT EXISTS seminar_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES seminar_items(id) ON DELETE CASCADE,
  position INT NOT NULL,
  file_ref TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seminar_slides_item_idx ON seminar_slides (item_id, position);

CREATE TABLE IF NOT EXISTS seminar_item_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES seminar_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
