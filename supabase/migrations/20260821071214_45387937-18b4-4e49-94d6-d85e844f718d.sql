WITH ranked AS (
  SELECT id,
         split_part(full_name, ' ', 1) AS first_name,
         row_number() OVER (PARTITION BY full_name ORDER BY created_at, id) AS rn
  FROM public.employees
),
pool AS (
  SELECT surname, ord
  FROM unnest(ARRAY['Whitaker','Delgado','Kowalski','Ferrell','Okonkwo','Vasquez','Lindqvist','Abernathy','Castellanos','Mbeki']) WITH ORDINALITY AS t(surname, ord)
)
UPDATE public.employees e
SET full_name = r.first_name || ' ' || p.surname
FROM ranked r
JOIN pool p ON p.ord = r.rn - 1
WHERE e.id = r.id AND r.rn > 1;