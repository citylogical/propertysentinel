-- Run manually in Supabase SQL Editor.
-- Disable email alerts for test/dev accounts so they stop getting digest emails.

UPDATE subscribers
SET email_alerts = false, updated_at = NOW()
WHERE email IN (
  'azreder@gmail.com',
  'propertysentinel.io.2q78n@simplelogin.com',
  'james.mcmahon@aldi.us'
);

-- Verify: should show only support@, jrmcmahon94@, jim@ as having email_alerts=true
SELECT email, email_alerts, sms_alerts FROM subscribers ORDER BY email;
