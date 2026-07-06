-- 0009_plans.sql: plan column on weddings (feature-flag foundation, no billing yet)
alter table weddings add column if not exists plan text not null default 'free';
comment on column weddings.plan is 'billing plan: free | premium (feature flags in src/lib/features.js)';
