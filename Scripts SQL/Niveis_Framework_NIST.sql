INSERT INTO governance_frameworklevel
(framework_id, level, name, description)
VALUES
(
    (SELECT id FROM governance_framework WHERE code = 'NISTCSF'),
    1,
    'Função',
    'Nível macro do CSF (ex.: Govern, Identify, Protect, Detect, Respond, Recover).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'NISTCSF'),
    2,
    'Categoria',
    'Agrupamentos de outcomes dentro de cada Função (ex.: ID.AM).'
),
(
    (SELECT id FROM governance_framework WHERE code = 'NISTCSF'),
    3,
    'Subcategoria',
    'Outcomes específicos dentro de cada Categoria (ex.: ID.AM-1).'
);

