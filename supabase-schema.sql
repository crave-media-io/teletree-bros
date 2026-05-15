-- TeleTree Bros Estimate Tool — Supabase Schema
-- Run this in your Supabase SQL Editor

-- Storage bucket for tree photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tree-photos', 'tree-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to tree photos
CREATE POLICY "Public read access for tree photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tree-photos');

-- Allow service role to upload tree photos
CREATE POLICY "Service role upload for tree photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tree-photos');

-- Estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Customer info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  description TEXT NOT NULL,
  is_emergency BOOLEAN DEFAULT FALSE,

  -- Photos (public URLs from Supabase Storage)
  photo_urls TEXT[] NOT NULL DEFAULT '{}',

  -- Analysis results
  species TEXT,
  species_type TEXT,
  estimated_height TEXT,
  estimated_time TEXT,
  difficulty TEXT,
  price_low INTEGER,
  price_high INTEGER,
  factors JSONB DEFAULT '[]',
  raw_analysis JSONB,

  -- Tracking
  status TEXT DEFAULT 'new'
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON estimates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates (status);
