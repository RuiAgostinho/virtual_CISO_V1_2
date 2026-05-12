-- NIST CSF 2.0 - Subcategorias (Level 3) - 106 registos
INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE-01', 'A baseline of network operations and expected data flows for users and systems is established and managed', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE-02', 'Potentially adverse events are analyzed to better understand associated activities', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE-03', 'Information is correlated from multiple sources', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE-04', 'The estimated impact and scope of adverse events are understood', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.AE-05', 'Incident alert thresholds are established', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-01', 'Networks and network services are monitored to find potentially adverse events', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-02', 'The physical environment is monitored to find potentially adverse events', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-03', 'Personnel activity and technology usage are monitored to find potentially adverse events', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-04', 'Malicious code is detected', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-05', 'Unauthorized mobile code is detected', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-06', 'External service provider activity is monitored to find potentially adverse events', 3, 6),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-07', 'Monitoring for unauthorized personnel, connections, devices, and software is performed', 3, 7),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.CM-08', 'Vulnerability scans are performed', 3, 8),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP-01', 'Roles and responsibilities for detection are well-defined to ensure accountability', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP-02', 'Detection activities comply with all applicable requirements', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP-03', 'Detection processes are tested to ensure effectiveness', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP-04', 'Event detection information is communicated to appropriate parties', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'DE.DP-05', 'Detection processes are continuously improved', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC-01', 'The organizational mission is understood and informs cybersecurity risk management', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC-02', 'Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC-03', 'Legal, regulatory, and contractual requirements regarding cybersecurity — including privacy and civil liberties obligations — are understood and managed', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC-04', 'Critical objectives, capabilities, and services that stakeholders depend on or expect from the organization are understood and communicated', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OC-05', 'Outcomes, capabilities, and services that the organization depends on are understood and communicated', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OV-01', 'Cybersecurity risk management strategy outcomes are reviewed to inform and adjust strategy and direction', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.OV-02', 'Cybersecurity risk management strategy and outcomes are evaluated and adjusted as needed', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.PO-01', 'Policy for managing cybersecurity risks is established based on organizational context and is communicated', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.PO-02', 'Policy for managing cybersecurity risks is reviewed, updated, and approved periodically', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-01', 'Risk management objectives are established and agreed to by organizational stakeholders', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-02', 'Risk appetite and risk tolerance statements are established, communicated, and maintained', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-03', 'Cybersecurity risk management activities and outcomes are included in enterprise risk management processes', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-04', 'Strategic direction for cybersecurity risk management is established and communicated', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-05', 'Risk is managed using a prioritized, risk-informed approach', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-06', 'Risk response options are selected, prioritized, and managed', 3, 6),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RM-07', 'Strategic opportunities (i.e., positive risks) are characterized and included in organizational cybersecurity risk discussions', 3, 7),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RR-01', 'Organizational leadership is responsible and accountable for cybersecurity risk and fosters a risk-aware culture', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RR-02', 'Cybersecurity roles, responsibilities, and authorities are established, communicated, and understood', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.RR-03', 'Adequate resources are allocated to support cybersecurity risk management', 3, 3),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC-01', 'Cybersecurity supply chain risk management processes are established, managed, monitored, and improved', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC-02', 'Suppliers are identified and prioritized by criticality', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC-03', 'Contracts with suppliers are used to implement appropriate measures designed to meet the objectives of the cybersecurity supply chain risk management program', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC-04', 'Suppliers are routinely assessed using risk-based processes', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'GV.SC-05', 'Plans are established and tested to respond to and recover from cybersecurity incidents within the supply chain', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-01', 'Inventories of hardware managed by the organization are maintained', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-02', 'Inventories of software, services, and systems managed by the organization are maintained', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-03', 'Representations of the organization’s authorized network communication and internal/external connectivity are maintained', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-04', 'Inventories of services provided by suppliers are maintained', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-05', 'Assets are prioritized based on classification, criticality, resources, and risk', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.AM-06', 'Cybersecurity roles and responsibilities for assets are established', 3, 6),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE-01', 'The organization’s critical services are identified and communicated', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE-02', 'The organization’s place in critical infrastructure and its industry sector is identified and communicated', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE-03', 'Priorities for organizational mission, objectives, and activities are established and communicated', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE-04', 'Dependencies and critical functions for delivery of critical services are established', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.BE-05', 'Resilience requirements to support delivery of critical services are established', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.GV-01', 'Organizational cybersecurity policy is established and communicated', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.GV-02', 'Cybersecurity roles and responsibilities are coordinated and aligned with internal roles and external partners', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.GV-03', 'Legal and regulatory requirements regarding cybersecurity, including privacy and civil liberties obligations, are understood and managed', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.GV-04', 'Governance and risk management processes address cybersecurity risks', 3, 4),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.IM-01', 'Improvements are identified from evaluations', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.IM-02', 'Improvements are implemented', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-01', 'Asset vulnerabilities are identified and documented', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-02', 'Cyber threat intelligence is received from information sharing forums and sources', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-03', 'Threats, vulnerabilities, likelihoods, and impacts are used to determine risk', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-04', 'Potential business impacts and likelihoods are identified', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-05', 'Risk responses are identified and prioritized', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'ID.RA-06', 'Risk assessments are performed and used to improve organizational cybersecurity risk management', 3, 6),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-01', 'Identities and credentials are issued, managed, verified, revoked, and audited for authorized devices, users, and processes', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-02', 'Physical access to assets is managed, monitored, and enforced commensurate with risk', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-03', 'Remote access is managed', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-04', 'Access permissions are managed, incorporating the principles of least privilege and separation of duties', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-05', 'Network integrity is protected', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-06', 'Access to systems and assets is managed in accordance with authorization policies', 3, 6),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AC-07', 'Users, devices, and other assets are authenticated (e.g., single-factor, multi-factor) commensurate with the risk of the transaction', 3, 7),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT-01', 'Users are provided awareness and training so they possess the knowledge and skills to perform general tasks with minimal risk', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT-02', 'Privileged users understand their roles and responsibilities', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT-03', 'Third-party stakeholders (e.g., suppliers, customers, partners) understand their roles and responsibilities', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT-04', 'Senior executives understand their roles and responsibilities', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.AT-05', 'Physical and cybersecurity personnel understand their roles and responsibilities', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-01', 'Data-at-rest is protected', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-02', 'Data-in-transit is protected', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-03', 'Assets are formally managed throughout removal, transfers, and disposition', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-04', 'Adequate capacity to ensure availability is maintained', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-05', 'Protections against data leaks are implemented', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-06', 'Integrity checking mechanisms are used to verify software, firmware, and information integrity', 3, 6),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-07', 'The development and testing environment(s) are separate from the production environment', 3, 7),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-08', 'The confidentiality, integrity, and availability of data are protected when using external services', 3, 8),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.DS-09', 'The confidentiality, integrity, and availability of data are protected when using service provider systems', 3, 9),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-01', 'A baseline configuration of information technology/industrial control systems is created and maintained incorporating security principles', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-02', 'A System Development Life Cycle to manage systems is implemented', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-03', 'Configuration change control processes are in place', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-04', 'Backups of information are conducted, maintained, and tested', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-05', 'Policy and regulations regarding the physical operating environment for organizational assets are met', 3, 5),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-06', 'Data is destroyed according to policy', 3, 6),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-07', 'Protection processes are improved', 3, 7),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-08', 'Effectiveness of protection technologies is shared', 3, 8),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-09', 'Response plans (Incident Response and Business Continuity) and recovery plans (Incident Recovery and Disaster Recovery) are in place and managed', 3, 9),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-10', 'Response and recovery plans are tested', 3, 10),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-11', 'Cybersecurity is included in human resources practices (e.g., deprovisioning, personnel screening)', 3, 11),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.IP-12', 'A vulnerability management plan is developed and implemented', 3, 12),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.MA-01', 'Maintenance and repair of organizational assets are performed and logged, with approved and controlled tools', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.MA-02', 'Remote maintenance of organizational assets is approved, logged, and performed in a manner that prevents unauthorized access', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT-01', 'Audit/log records are determined, documented, implemented, and reviewed in accordance with policy', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT-02', 'Removable media is protected and its use restricted according to policy', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT-03', 'The principle of least functionality is incorporated by configuring systems to provide only essential capabilities', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT-04', 'Communications and control networks are protected', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'PR.PT-05', 'Mechanisms (e.g., failsafe, load balancing, hot swap) are implemented to achieve resilience requirements in normal and adverse situations', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.CO-01', 'Public relations are managed', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.CO-02', 'Reputation is repaired after an incident', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.IM-01', 'Recovery plans incorporate lessons learned', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.IM-02', 'Recovery strategies are updated', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RC.RP-01', 'Recovery plan is executed during or after a cybersecurity incident', 3, 1),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN-01', 'Notifications from detection systems are investigated', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN-02', 'The impact of the incident is understood', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN-03', 'Forensics are performed', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN-04', 'Incidents are categorized consistent with response plans', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.AN-05', 'Processes are established to receive, analyze, and respond to vulnerabilities disclosed to the organization from internal and external sources', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO-01', 'Personnel know their roles and order of operations when a response is needed', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO-02', 'Incidents are reported consistent with established criteria', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO-03', 'Information is shared consistent with response plans', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO-04', 'Coordination with stakeholders occurs consistent with response plans', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.CO-05', 'Voluntary information sharing occurs with external stakeholders', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.IM-01', 'Response plans incorporate lessons learned', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.IM-02', 'Response strategies are updated', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MA-01', 'Incidents are mitigated', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MA-02', 'Incidents are triaged', 3, 2),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MA-03', 'Newly identified vulnerabilities are mitigated or documented as accepted risks', 3, 3),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MA-04', 'Incidents are reported to appropriate internal and external stakeholders', 3, 4),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MA-05', 'The criteria for initiating incident recovery are applied', 3, 5),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MI-01', 'Incidents are contained', 3, 1),
((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.MI-02', 'Incidents are eradicated', 3, 2),

((SELECT id FROM governance_framework WHERE code='NISTCSF'), NULL, 'RS.RP-01', 'Response plan is executed during or after an incident', 3, 1)
ON CONFLICT (framework_id, code) DO NOTHING;

-- Ligar automaticamente cada Subcategoria (nível 3) à respetiva Categoria (nível 2)
UPDATE governance_frameworksection child
SET parent_id = parent.id
FROM governance_frameworksection parent
WHERE child.framework_id = (SELECT id FROM governance_framework WHERE code='NISTCSF')
  AND parent.framework_id = child.framework_id
  AND child.level = 3
  AND parent.level = 2
  AND parent.code = split_part(child.code, '-', 1);  -- GV.OC-01 -> GV.OC
