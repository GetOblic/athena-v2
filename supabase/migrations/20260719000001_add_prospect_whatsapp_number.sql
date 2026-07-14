-- Optional Prospect WhatsApp contact number (metadata only).
-- Dedicated to this field; does not alter asset interactions or other prospect columns.

alter table prospects
  add column if not exists whatsapp_number text;

comment on column prospects.whatsapp_number is
  'Optional WhatsApp contact number used for outreach and operational contact metadata.';
