INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
-- GV (Govern) - faltam 6
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC', 'Organizational Context', 2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM', 'Risk Management Strategy', 2, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RR', 'Roles, Responsibilities, and Authorities', 2, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.PO', 'Policies, Processes, and Procedures', 2, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OV', 'Oversight', 2, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC', 'Supply Chain Risk Management', 2, 6),

-- ID (Identify) - faltam 4 (ID.AM já tens)
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE', 'Business Environment', 2, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.GV', 'Governance', 2, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA', 'Risk Assessment', 2, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.IM', 'Improvement', 2, 5),

-- PR (Protect) - faltam 5 (PR.AC já tens)
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT', 'Awareness and Training', 2, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS', 'Data Security', 2, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP', 'Information Protection Processes and Procedures', 2, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.MA', 'Maintenance', 2, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT', 'Protective Technology', 2, 6),

-- DE (Detect) - faltam 2 (DE.CM já tens)
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE', 'Anomalies and Events', 2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP', 'Detection Processes', 2, 3),

-- RS (Respond) - faltam 5
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.RP', 'Response Planning', 2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO', 'Communications', 2, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN', 'Analysis', 2, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MI', 'Mitigation', 2, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.IM', 'Improvement', 2, 5),

-- RC (Recover) - faltam 3
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.RP', 'Recovery Planning', 2, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.IM', 'Improvement', 2, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.CO', 'Communications', 2, 3)
ON CONFLICT (framework_id, code) DO NOTHING;
