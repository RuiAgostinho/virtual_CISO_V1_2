INSERT INTO governance_frameworklevel
(framework_id, level, name, description)
VALUES
(
    (SELECT id FROM governance_framework WHERE code = 'QNRC'),
    1,
    'Objetivo',
    'Objetivo/Função do QNRCS (Identificar, Proteger, Detetar, Responder, Recuperar).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'QNRC'),
    2,
    'Domínio',
    'Agrupamento temático dentro do objetivo (categoria/domínio do referencial).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'QNRC'),
    3,
    'Medida',
    'Medida de cibersegurança a implementar/avaliar (unidade base para evidências e maturidade).'
);

