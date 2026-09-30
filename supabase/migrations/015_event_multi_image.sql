-- =================================================================================
-- 015_event_multi_image.sql
-- Adds JSONB images gallery to public.events.
-- banner_image_url remains the primary/hero image.
-- images stores an ordered array of additional/all image URLs.
-- Safe and idempotent.
-- =================================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.events.images IS
  'Ordered array of image URLs. First element is the primary banner image, rest are gallery images.';

-- Index for jsonb queries if needed in future
CREATE INDEX IF NOT EXISTS idx_events_images ON public.events USING gin(images);
