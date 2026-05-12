INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
((SELECT id FROM governance_framework WHERE code='ISO27002'), NULL, '5', 'Controlos Organizacionais', 1, 5),
((SELECT id FROM governance_framework WHERE code='ISO27002'), NULL, '6', 'Controlos de Pessoas',      1, 6),
((SELECT id FROM governance_framework WHERE code='ISO27002'), NULL, '7', 'Controlos Físicos',        1, 7),
((SELECT id FROM governance_framework WHERE code='ISO27002'), NULL, '8', 'Controlos Tecnológicos',   1, 8)
ON CONFLICT (framework_id, code) DO NOTHING;

-- 5.1 .. 5.37
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '5.' || gs::text AS code,
  'Controlo 5.' || gs::text AS name,
  2,
  gs
FROM generate_series(1, 37) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 6.1 .. 6.8
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '6.' || gs::text,
  'Controlo 6.' || gs::text,
  2,
  gs
FROM generate_series(1, 8) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 7.1 .. 7.14
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '7.' || gs::text,
  'Controlo 7.' || gs::text,
  2,
  gs
FROM generate_series(1, 14) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 8.1 .. 8.34
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '8.' || gs::text,
  'Controlo 8.' || gs::text,
  2,
  gs
FROM generate_series(1, 34) gs
ON CONFLICT (framework_id, code) DO NOTHING;


-- 5.1 .. 5.37
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '5.' || gs::text AS code,
  'Controlo 5.' || gs::text AS name,
  2,
  gs
FROM generate_series(1, 37) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 6.1 .. 6.8
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '6.' || gs::text,
  'Controlo 6.' || gs::text,
  2,
  gs
FROM generate_series(1, 8) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 7.1 .. 7.14
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '7.' || gs::text,
  'Controlo 7.' || gs::text,
  2,
  gs
FROM generate_series(1, 14) gs
ON CONFLICT (framework_id, code) DO NOTHING;

-- 8.1 .. 8.34
INSERT INTO governance_frameworksection (framework_id, parent_id, code, name, level, sort_order)
SELECT
  (SELECT id FROM governance_framework WHERE code='ISO27002'),
  NULL,
  '8.' || gs::text,
  'Controlo 8.' || gs::text,
  2,
  gs
FROM generate_series(1, 34) gs
ON CONFLICT (framework_id, code) DO NOTHING;

UPDATE governance_frameworksection child
SET parent_id = parent.id
FROM governance_frameworksection parent
WHERE child.framework_id = (SELECT id FROM governance_framework WHERE code='ISO27002')
  AND parent.framework_id = child.framework_id
  AND child.level = 2
  AND parent.level = 1
  AND parent.code = split_part(child.code, '.', 1);  -- 5.12 -> 5