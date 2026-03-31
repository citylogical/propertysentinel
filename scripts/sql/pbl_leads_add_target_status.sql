-- Run in Supabase SQL editor: add 'target' to pbl_leads.status check constraint.
ALTER TABLE pbl_leads
DROP CONSTRAINT IF EXISTS pbl_leads_status_check;

ALTER TABLE pbl_leads
ADD CONSTRAINT pbl_leads_status_check
CHECK (status IN ('not_started', 'target', 'letter_sent', 'called', 'responded', 'converted'));
