CREATE TABLE IF NOT EXISTS subs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT
);

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT
);

CREATE TABLE IF NOT EXISTS protocols (
  id SERIAL PRIMARY KEY,
  sub_id INTEGER NOT NULL REFERENCES subs(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  trade TEXT,
  task_summary TEXT,
  applicable_subparts JSONB NOT NULL DEFAULT '[]',
  required_ppe JSONB NOT NULL DEFAULT '[]',
  required_equipment JSONB NOT NULL DEFAULT '[]',
  cited_sections JSONB NOT NULL DEFAULT '[]',
  review_cadence JSONB NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','approved')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  task_status TEXT NOT NULL DEFAULT 'active' CHECK (task_status IN ('active','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_items (
  id SERIAL PRIMARY KEY,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  attested_by TEXT,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('initial','ongoing')),
  due_date DATE,
  completed_by TEXT,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS photo_checks (
  id SERIAL PRIMARY KEY,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('compliant','flagged')),
  findings JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo_check_images (
  id SERIAL PRIMARY KEY,
  photo_check_id INTEGER NOT NULL REFERENCES photo_checks(id) ON DELETE CASCADE,
  photo_data TEXT NOT NULL,
  photo_mime TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protocols_sub ON protocols(sub_id);
CREATE INDEX IF NOT EXISTS idx_protocols_site ON protocols(site_id);
CREATE INDEX IF NOT EXISTS idx_training_protocol ON training_items(protocol_id);
CREATE INDEX IF NOT EXISTS idx_reviews_protocol ON reviews(protocol_id);
CREATE INDEX IF NOT EXISTS idx_photo_checks_protocol ON photo_checks(protocol_id);
CREATE INDEX IF NOT EXISTS idx_photo_check_images_check ON photo_check_images(photo_check_id);
