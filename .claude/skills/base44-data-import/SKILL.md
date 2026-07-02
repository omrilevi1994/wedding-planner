---
name: base44-data-import
description: "Pull data from the base44 REST API and import it into Supabase, id-preserving. Use to (re)load base44 data."
---

# base44 Data Import

Pull data from the base44 REST API and load it into Supabase while preserving record IDs.

## 1. Configure environment

Ensure `.env` contains the base44 credentials and the Supabase connection variables:

```bash
BASE44_API_URL=https://api.base44.com
BASE44_API_KEY=your-base44-api-key

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 2. Pull a snapshot

Fetch the data from base44 and write JSON snapshots to `.data-snapshots/*.json`:

```bash
npm run data:pull
```

## 3. Import into Supabase

Upsert the snapshot into Supabase. The importer runs in dependency order, coerces empty strings (`''`) to `null`, and nulls out dangling foreign keys:

```bash
npm run data:import
```

## Notes

- The `.data-snapshots/` directory is **git-ignored** and the snapshots **contain PII**. Do not commit them or share them.
- Expect roughly the real production counts — about **352 guests** — after a successful pull/import. A wildly different count signals a partial pull or auth issue.

## 4. Verify (orphan check)

After importing, run the orphan-check SQL against Supabase to confirm no foreign keys point at missing rows:

```sql
-- Any guest whose household_id does not exist is an orphan.
SELECT g.id, g.household_id
FROM guests g
LEFT JOIN households h ON h.id = g.household_id
WHERE g.household_id IS NOT NULL
  AND h.id IS NULL;
```

An empty result set means the import is clean.
