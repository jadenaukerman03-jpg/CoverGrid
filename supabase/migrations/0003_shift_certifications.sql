-- Certifications a specific shift instance requires (e.g. a vent-dependent
-- unit's night shift requiring BLS). Separate from employee_certifications,
-- which is what a given employee actually holds.

alter table shift_instances
  add column required_certifications text[] not null default '{}';
