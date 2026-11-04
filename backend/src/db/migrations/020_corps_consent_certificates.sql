-- Phase 14: consent to share details with NYSC AGROALLIED SAED is required for every corps member.
-- A member who registered before it was required keeps working but sees a banner, and their certificate
-- is not released until they tick it. consent_data_at records when they ticked.
ALTER TABLE corper_profiles ADD COLUMN IF NOT EXISTS consent_data_at TIMESTAMPTZ;
-- One reminder per certificate that is held back because of missing consent (so a batch closing twice does not nag).
ALTER TABLE corper_certificates ADD COLUMN IF NOT EXISTS consent_reminded_at TIMESTAMPTZ;
