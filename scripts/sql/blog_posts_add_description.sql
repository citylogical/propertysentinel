-- Run in Supabase SQL editor
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS description text;
