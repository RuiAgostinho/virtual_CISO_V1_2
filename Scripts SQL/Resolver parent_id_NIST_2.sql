UPDATE governance_frameworksection child
SET parent_id = parent.id
FROM governance_frameworksection parent
WHERE child.framework_id = (SELECT id FROM governance_framework WHERE code='NISTCSF')
  AND parent.framework_id = child.framework_id
  AND child.level = 2
  AND parent.level = 1
  AND parent.code = split_part(child.code, '.', 1);
