-- =========================
-- QNRC (QNRCS) - Framework Sections
-- Nível 1: Objetivos
-- Nível 2: Categorias
-- =========================

-- ---------- NÍVEL 1 (Objetivos) ----------
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID', 'Identificar', 1, 10, f.id, NULL
FROM governance_framework f
WHERE f.code = 'QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR', 'Proteger', 1, 20, f.id, NULL
FROM governance_framework f
WHERE f.code = 'QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'DE', 'Detetar', 1, 30, f.id, NULL
FROM governance_framework f
WHERE f.code = 'QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS', 'Responder', 1, 40, f.id, NULL
FROM governance_framework f
WHERE f.code = 'QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RC', 'Recuperar', 1, 50, f.id, NULL
FROM governance_framework f
WHERE f.code = 'QNRC';

-- ---------- NÍVEL 2 (Categorias) ----------
-- IDENTIFICAR (ID.*)
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.GA', 'Gestão de Ativos', 2, 110, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.AO', 'Ambiente da Organização', 2, 120, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.GV', 'Governação', 2, 130, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.AR', 'Avaliação do Risco', 2, 140, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.GR', 'Estratégia de Gestão do Risco', 2, 150, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'ID.GL', 'Gestão do Risco da Cadeia Logística', 2, 160, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='ID'
WHERE f.code='QNRC';

-- PROTEGER (PR.*)
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.GA', 'Gestão de Identidades, Autenticação e Controlo de Acessos', 2, 210, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.SD', 'Segurança de Dados', 2, 220, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.PI', 'Processos e Procedimentos', 2, 230, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.MA', 'Manutenção', 2, 240, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.FC', 'Formação e Sensibilização', 2, 250, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'PR.TP', 'Tecnologia de Proteção', 2, 260, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='PR'
WHERE f.code='QNRC';

-- DETETAR (DE.*)
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'DE.AE', 'Anomalias e Eventos', 2, 310, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='DE'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'DE.MC', 'Monitorização Contínua de Segurança', 2, 320, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='DE'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'DE.PD', 'Processos de Deteção', 2, 330, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='DE'
WHERE f.code='QNRC';

-- RESPONDER (RS.*)
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS.PR', 'Planeamento da Resposta', 2, 410, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RS'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS.CO', 'Comunicações', 2, 420, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RS'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS.AN', 'Análise', 2, 430, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RS'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS.MI', 'Mitigação', 2, 440, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RS'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RS.ME', 'Melhorias', 2, 450, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RS'
WHERE f.code='QNRC';

-- RECUPERAR (RC.*)
INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RC.PR', 'Planeamento da Recuperação', 2, 510, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RC'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RC.ME', 'Melhorias', 2, 520, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RC'
WHERE f.code='QNRC';

INSERT INTO governance_frameworksection (code, name, level, sort_order, framework_id, parent_id)
SELECT 'RC.CO', 'Comunicações', 2, 530, f.id, p.id
FROM governance_framework f
JOIN governance_frameworksection p ON p.framework_id=f.id AND p.code='RC'
WHERE f.code='QNRC';
