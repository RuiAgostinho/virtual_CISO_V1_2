INSERT INTO governance_frameworklevel
(framework_id, level, name, description)
VALUES
(
    (SELECT id FROM governance_framework WHERE code = 'ISO27002'),
    1,
    'Domínio',
    'Agrupamento principal de controlos (Organizacionais, Pessoas, Físicos, Tecnológicos).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'ISO27002'),
    2,
    'Tema',
    'Secção dentro de um domínio (ex.: A.5, A.6…).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'ISO27002'),
    3,
    'Controlo',
    'Controlo individual (ex.: A.5.1…).'
);

