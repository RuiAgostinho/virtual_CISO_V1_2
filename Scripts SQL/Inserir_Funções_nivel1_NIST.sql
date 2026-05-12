INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV', 'Govern',   1, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID', 'Identify', 1, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR', 'Protect',  1, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE', 'Detect',   1, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS', 'Respond',  1, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC', 'Recover',  1, 6);
