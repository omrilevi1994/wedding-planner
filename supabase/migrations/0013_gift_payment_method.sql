-- Payment method for gifts ("how it came" — cash / credit / Bit / check / custom).
-- Plain free-text column, no enum/check constraint, same approach as guests.side and
-- guests.relationship: a small set of sensible defaults live in the client
-- (src/lib/giftOptions.js) merged with whatever custom values a wedding has already
-- used, so users can add new payment-method tags on the fly without a migration.
alter table gifts add column if not exists payment_method text;
