-- base44 set created_by (email) / created_by_id automatically server-side.
-- Replicate that for authenticated app inserts so ownership/quota logic works.
-- Service-role imports already provide created_by, so the null-guard leaves them intact.
create or replace function set_created_by()
returns trigger language plpgsql security definer as $$
begin
  if new.created_by is null then new.created_by := auth.jwt()->>'email'; end if;
  if new.created_by_id is null then new.created_by_id := auth.uid()::text; end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['weddings','tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format('create trigger trg_%1$s_created_by before insert on %1$s for each row execute function set_created_by();', t);
  end loop;
end $$;
