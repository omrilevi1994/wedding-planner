-- How many of a guest row's total_people are children (children cost a
-- (cheaper) kids' meal but typically give a smaller gift).
alter table guests add column if not exists children_count numeric default 0;
