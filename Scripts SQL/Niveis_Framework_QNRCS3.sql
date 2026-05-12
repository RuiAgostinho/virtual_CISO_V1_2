-- ============================================================
-- QNRCS (QNRC) - Subcategorias (nível 3)
-- parent_id é resolvido no fim via UPDATE
-- ============================================================

INSERT INTO governance_frameworksection
(framework_id, parent_id, code, name, level, sort_order)
VALUES
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GA-1', 'A organização deve inventariar os seus dispositivos físicos, redes e sistemas de informação existentes, por forma a garantir que existe um mapeamento estruturado dos mesmos', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GA-2', 'As aplicações e plataformas de software da organização, que suportam os processos dos serviços críticos, devem ser inventariadas e classificadas de acordo com a sua relevância para a organização', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GA-3', 'As redes e fluxos de dados devem ser mapeados', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GA-4', 'A organização deve identificar e catalogar as redes e sistemas de informação externos', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GA-5', 'A organização deve classificar os seus ativos (humanos, tecnológicos de hardware e software, dispositivos, dados, tempo e aplicações), de acordo com a criticidade e valor que estes ativos representem para si', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AO-1', 'O papel da organização na cadeia logística deve ser identificado e comunicado', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AO-2', 'O posicionamento da organização no seu setor de atividade deve ser identificado e comunicado', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AO-3', 'A missão, visão, valores, estratégias e objetivos da organização devem ser definidas e comunicadas', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AO-4', 'Os ativos críticos devem ser identificados e registados', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AO-5', 'Os requisitos de resiliência necessários para suportar a prestação de serviços críticos devem ser definidos', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GV-1', 'A política de segurança da informação deve ser definida e comunicada', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GV-2', 'Os requisitos legais e regulamentares para a cibersegurança devem ser cumpridos', 3, 2),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AR-1', 'As vulnerabilidades dos ativos devem ser identificadas e documentadas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AR-2', 'A organização deve partilhar informações sobre ameaças de cibersegurança com grupos de interesse da especialidade', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AR-3', 'As ameaças internas e externas devem ser identificadas e documentadas na metodologia de gestão do risco', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AR-4', 'A gestão do risco deve ser efetuada com base na análise de ameaças, vulnerabilidades, probabilidades e impactos', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.AR-5', 'A organização deve priorizar os seus recursos e investimentos de acordo com a criticidade dos ativos e o nível do risco', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GR-1', 'A organização deve acordar e formalizar a sua estratégia de gestão do risco', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GR-2', 'A organização deve determinar e identificar a sua tolerância ao risco', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GR-3', 'A organização deve definir a sua estratégia de tratamento do risco', 3, 3),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GL-1', 'A organização deve garantir que efetua uma análise às partes interessadas pertencentes à sua cadeia logística, utilizando a mesma metodologia de análise e de gestão interna do risco', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GL-2', 'A organização deve avaliar o risco da cadeia logística de cibersegurança', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GL-3', 'Os contratos com fornecedores devem respeitar o plano de gestão do risco para a cadeia logística', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GL-4', 'Os fornecedores devem ser periodicamente avaliados', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'ID.GL-5', 'O plano de resposta e recuperação de desastre deve ser exercitado com o acompanhamento de fornecedores', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-1', 'O ciclo de vida de gestão de identidades deve ser definido', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-2', 'Devem existir controlos de acesso físico às redes e sistemas de informação', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-3', 'A organização deve gerir os seus acessos remotos', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-4', 'A gestão das permissões de acesso deve incorporar os princípios de menor privilégio e segregação de funções', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-5', 'A organização deve proteger a integridade das redes de comunicações', 3, 5),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-6', 'Os acessos a redes e sistemas de informação devem ser realizados de acordo com a política de controlo de acessos', 3, 6),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.GA-7', 'Os utilizadores e dispositivos devem ser autenticados com mecanismos proporcionais ao risco', 3, 7),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.FC-1', 'Os colaboradores devem ter formação em segurança da informação', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.FC-2', 'Os utilizadores com privilégios devem compreender as suas funções e responsabilidades', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.FC-3', 'As partes interessadas externas devem compreender as suas funções e responsabilidades em cibersegurança', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.FC-4', 'A gestão de topo deve compreender as suas funções e responsabilidades', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.FC-5', 'Os técnicos responsáveis por tarefas de cibersegurança devem compreender as suas funções e responsabilidades', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-1', 'Os dados em repouso devem ser protegidos', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-2', 'Os dados em trânsito devem ser protegidos', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-3', 'Os ativos devem ser formalmente geridos durante a sua remoção, transferência e eliminação', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-4', 'A organização deve manter capacidade adequada para garantir disponibilidade', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-5', 'Devem ser implementadas proteções contra fuga de informação', 3, 5),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-6', 'Devem ser utilizados mecanismos de verificação de integridade de software, firmware e informação', 3, 6),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-7', 'Os ambientes de desenvolvimento e teste devem estar separados do ambiente de produção', 3, 7),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-8', 'A confidencialidade, integridade e disponibilidade dos dados devem ser protegidas quando se utilizam serviços externos', 3, 8),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.SD-9', 'A confidencialidade, integridade e disponibilidade dos dados devem ser protegidas quando se utilizam sistemas do prestador de serviço', 3, 9),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-1', 'Deve existir e ser mantida uma configuração de base de sistemas e equipamentos que incorpore princípios de segurança', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-2', 'Deve ser implementado um ciclo de vida de desenvolvimento e gestão de sistemas', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-3', 'Devem existir processos de controlo de alterações de configuração', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-4', 'Devem ser efetuadas, mantidas e testadas cópias de segurança da informação', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-5', 'As políticas e regulamentos do ambiente físico de operação dos ativos devem ser cumpridos', 3, 5),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-6', 'Os dados devem ser destruídos de acordo com a política definida', 3, 6),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-7', 'Os processos de proteção devem ser melhorados', 3, 7),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-8', 'A eficácia das tecnologias de proteção deve ser partilhada', 3, 8),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-9', 'Devem existir e ser geridos planos de resposta e recuperação', 3, 9),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-10', 'Os planos de resposta e recuperação devem ser testados', 3, 10),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-11', 'A cibersegurança deve ser incluída nas práticas de recursos humanos', 3, 11),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.PI-12', 'Deve ser desenvolvido e implementado um plano de gestão de vulnerabilidades', 3, 12),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.MA-1', 'A manutenção e reparação dos ativos da organização devem ser realizadas e registadas com ferramentas aprovadas e controladas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.MA-2', 'A manutenção remota dos ativos da organização deve ser aprovada, registada e executada de forma a prevenir acessos não autorizados', 3, 2),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.TP-1', 'Os registos de auditoria e de histórico da organização devem ser determinados, documentados, implementados e revistos de acordo com as políticas correspondentes', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.TP-2', 'Os suportes removíveis devem ser protegidos e a sua utilização deve ser restringida de acordo com as políticas', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.TP-3', 'O princípio de menor funcionalidade deve ser incorporado configurando sistemas apenas com capacidades essenciais', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.TP-4', 'As redes de comunicações e redes de controlo devem ser protegidas', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'PR.TP-5', 'Devem ser implementados mecanismos de resiliência para cumprir requisitos em situações normais e adversas', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.AE-1', 'Deve existir e ser gerida uma linha de base de operações de rede e fluxos de dados esperados para utilizadores e sistemas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.AE-2', 'Eventos potencialmente adversos devem ser analisados para melhor compreender as atividades associadas', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.AE-3', 'A informação deve ser correlacionada a partir de múltiplas fontes', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.AE-4', 'O impacto e âmbito estimados de eventos adversos devem ser compreendidos', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.AE-5', 'Devem ser estabelecidos limiares de alerta de incidentes', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-1', 'Redes e serviços de rede devem ser monitorizados para detetar eventos potencialmente adversos', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-2', 'O ambiente físico deve ser monitorizado para detetar eventos potencialmente adversos', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-3', 'A atividade de pessoal e uso de tecnologia devem ser monitorizados para detetar eventos potencialmente adversos', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-4', 'Código malicioso deve ser detetado', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-5', 'Código móvel não autorizado deve ser detetado', 3, 5),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-6', 'A atividade de prestadores externos deve ser monitorizada para detetar eventos potencialmente adversos', 3, 6),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-7', 'Deve existir monitorização para pessoal, ligações, dispositivos e software não autorizados', 3, 7),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.MC-8', 'Devem ser realizadas varreduras de vulnerabilidades', 3, 8),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.PD-1', 'Funções e responsabilidades de deteção devem estar definidas para garantir responsabilização', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.PD-2', 'Atividades de deteção devem cumprir requisitos aplicáveis', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.PD-3', 'Processos de deteção devem ser testados para assegurar eficácia', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.PD-4', 'Informação de deteção de eventos deve ser comunicada às partes apropriadas', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'DE.PD-5', 'Processos de deteção devem ser continuamente melhorados', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.PR-1', 'O plano de resposta deve ser executado durante ou após um incidente', 3, 1),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.CO-1', 'O pessoal deve conhecer as suas funções e ordem de operações quando é necessária uma resposta', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.CO-2', 'Os incidentes devem ser reportados de acordo com critérios estabelecidos', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.CO-3', 'A informação deve ser partilhada de acordo com os planos de resposta', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.CO-4', 'A coordenação com partes interessadas deve ocorrer de acordo com os planos de resposta', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.CO-5', 'Deve ocorrer partilha voluntária de informação com partes interessadas externas', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.AN-1', 'Notificações de sistemas de deteção devem ser investigadas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.AN-2', 'O impacto do incidente deve ser compreendido', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.AN-3', 'Devem ser realizadas análises forenses', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.AN-4', 'Incidentes devem ser categorizados de acordo com planos de resposta', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.AN-5', 'Devem existir processos para receber, analisar e responder a vulnerabilidades divulgadas por fontes internas e externas', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MI-1', 'Incidentes devem ser contidos', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MI-2', 'Incidentes devem ser erradicados', 3, 2),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MA-1', 'Incidentes devem ser mitigados', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MA-2', 'Incidentes devem ser triados', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MA-3', 'Vulnerabilidades recém-identificadas devem ser mitigadas ou documentadas como riscos aceites', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MA-4', 'Incidentes devem ser reportados às partes interessadas internas e externas apropriadas', 3, 4),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.MA-5', 'Critérios para iniciar recuperação de incidentes devem ser aplicados', 3, 5),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.ME-1', 'Os planos de resposta a incidentes devem incorporar as lições aprendidas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RS.ME-2', 'As estratégias de resposta a incidentes devem ser atualizadas', 3, 2),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.PR-1', 'A organização deve seguir um plano de recuperação durante ou após um incidente', 3, 1),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.ME-1', 'Os planos de recuperação devem incorporar as lições aprendidas', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.ME-2', 'As estratégias de recuperação devem ser continuamente revistas e atualizadas', 3, 2),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.ME-3', 'As capacidades de recuperação devem ser melhoradas com base em avaliações e lições aprendidas', 3, 3),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.ME-4', 'Planos e procedimentos de recuperação devem ser testados e exercitados periodicamente', 3, 4),

((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.CO-1', 'A organização deve implementar um plano de comunicação', 3, 1),
((SELECT id FROM governance_framework WHERE code='QNRC'), NULL, 'RC.CO-2', 'As atividades de recuperação devem ser comunicadas às partes interessadas internas e externas, bem como às equipas executivas e de gestão', 3, 2)
ON CONFLICT (framework_id, code) DO NOTHING;

-- ============================================================
-- Ligar automaticamente subcategorias (nível 3) às categorias (nível 2)
-- Ex.: PR.GA-3 -> parent PR.GA
-- ============================================================
UPDATE governance_frameworksection child
SET parent_id = parent.id
FROM governance_frameworksection parent
WHERE child.framework_id = (SELECT id FROM governance_framework WHERE code='QNRC')
  AND parent.framework_id = child.framework_id
  AND child.level = 3
  AND parent.level = 2
  AND parent.code = split_part(child.code, '-', 1);
