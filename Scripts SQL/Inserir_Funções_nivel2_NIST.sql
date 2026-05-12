INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM', 'Asset Management', 2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC', 'Access Control',   2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM', 'Continuous Monitoring', 2, 1);
