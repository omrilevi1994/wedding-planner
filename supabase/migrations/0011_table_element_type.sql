-- Extend `tables` to support non-guest venue elements (stage/bar) that can be
-- placed and dragged on the seating plan canvas alongside guest tables, reusing
-- the same row shape (name, location_x/y) and RLS instead of a new table.
alter table tables add column if not exists element_type text not null default 'table';

alter table tables drop constraint if exists tables_element_type_check;
alter table tables add constraint tables_element_type_check
  check (element_type in ('table', 'stage', 'bar'));
