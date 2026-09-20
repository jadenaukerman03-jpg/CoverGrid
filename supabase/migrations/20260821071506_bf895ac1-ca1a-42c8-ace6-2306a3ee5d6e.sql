WITH dup AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.employees WHERE full_name = 'Finley Delgado'
)
UPDATE public.employees e SET full_name = 'Finley Marchetti'
FROM dup WHERE e.id = dup.id AND dup.rn = 2;