# Virtual CISO — Plataforma de Apoio Estratégico à Decisão para CISOs

Plataforma integrada de apoio à decisão para Chief Information Security Officers (CISOs), que articula governação, risco e conformidade (GRC) em cibersegurança com técnicas de Inteligência Artificial explicável.

Desenvolvida como artefacto de um Trabalho de Projeto do Mestrado em Cibersegurança e Informática Forense da Escola Superior de Tecnologia e Gestão (ESTG) do Instituto Politécnico de Leiria, seguindo a metodologia Design Science Research (DSR).

> **Versão do relatório:** a versão avaliada no Trabalho de Projeto está congelada na tag [`v1.0-thesis`](https://github.com/RuiAgostinho/virtual_CISO_V1_2/releases/tag/v1.0-thesis). O ramo principal pode conter evolução posterior.

## Principais capacidades

- **Fio condutor do CISO (Mission Control)** — página inicial programática que calcula a etapa do programa de segurança que requer atenção, os sinais que a justificam e a próxima ação recomendada
- **Priorização contextual de vulnerabilidades** — modelo ponderado e explicável que combina CVSS, EPSS, CISA KEV, criticidade do ativo, exposição, valor de negócio, mecanismos de mitigação e relevância normativa, com decomposição por fatores
- **Conformidade multi-referencial** — ISO/IEC 27001, NIST CSF, NIS2, DL 125/2025 e QNRC sobre um modelo comum de controlos internos, mecanismos e evidência reutilizável, com propagação de postura baseada em evidência válida
- **Rastreabilidade transversal** — navegação bidirecional entre requisitos, controlos, mecanismos, evidência, ativos, riscos e decisões
- **Assistente CISO com RAG híbrido** — perguntas em linguagem natural com respostas ancoradas em fontes citáveis (recuperação estruturada + semântica), executado localmente via Ollama
- **Deteção de drift de conformidade** — comparação determinística entre fotografias de postura persistidas e o estado atual, com eventos de regressão e melhoria
- **Governação de IA** — estimador interno XGBoost+SHAP preparado mas desativado por mecanismo de prontidão (modo sombra, limiares de dados rotulados, métricas de validação)

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind |
| Backend | Django REST Framework (aplicações temáticas + serviços de domínio) |
| Persistência | PostgreSQL + pgvector (embeddings RAG) |
| IA local | Ollama (qwen2.5:7b, llama3.1:8b) |
| Fontes externas | NIST NVD, FIRST EPSS, CISA KEV, Wazuh, Nmap |

A lógica crítica (cálculo de risco, priorização, conformidade, rastreabilidade, drift) reside em serviços de domínio no backend. O frontend apresenta resultados calculados e persistidos, sem duplicar regras de negócio.

## Estrutura do repositório

```
backend/      API Django REST (authapi, company, risk, governance, integrations, ciso_assistant, chat, core)
frontend/     Aplicação React + TypeScript
Scripts SQL/  Scripts de apoio à importação de referenciais
docs/         Material de rastreabilidade do relatório (não versionado na íntegra)
```

## Requisitos

- Python 3.12+
- Node.js 18+ e npm
- PostgreSQL 15+ com a extensão [pgvector](https://github.com/pgvector/pgvector)
- [Ollama](https://ollama.com) com os modelos `qwen2.5:7b` e `llama3.1:8b` (opcional, necessário para o assistente)
- Integrações externas (Wazuh, NVD, EPSS, KEV, Nmap) são opcionais e configuram-se na área de administração da aplicação

> **Hardware:** a inferência local de LLMs beneficia de GPU dedicada. Em CPU, as respostas do assistente podem demorar 1 a 3 minutos (ver Secção 5.7 do relatório).

## Instalação e execução

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # editar com os valores locais (PostgreSQL, Ollama)
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Por omissão, o frontend espera o backend em `http://localhost:8000` e serve a interface em `http://localhost:5173`.

## Reprodução do cenário de demonstração

Uma instalação de raiz produz um sistema funcional mas **vazio** (sem ativos, vulnerabilidades, referenciais ou evidência). O cenário utilizado na demonstração do relatório (54 ativos, 1159 vulnerabilidades, 7 referenciais) foi construído através das integrações técnicas e da introdução de informação organizacional, e encontra-se documentado no Anexo J do relatório. A verificação das capacidades descritas pode apoiar-se nas capturas de ecrã (Anexo L), nos exemplos de interação do assistente (Anexo K) e nos resultados quantitativos (Secção 5.7).

Para começar, importe um referencial na área de administração, registe ativos (manualmente ou via integração) e sincronize as fontes de inteligência (NVD, EPSS, KEV).

## Limitações

Este software é uma **prova de conceito académica**, não um produto pronto para produção. Não foi submetido a testes de intrusão, testes de carga nem avaliação com utilizadores finais. As limitações e o plano de evolução estão discutidos nos Capítulos 5 e 6 do relatório.

## Contexto académico e citação

Este repositório acompanha o Trabalho de Projeto:

> Agostinho, R. M. G. (2026). *Plataforma de Apoio Estratégico à Decisão para CISOs*. Trabalho de Projeto de Mestrado em Cibersegurança e Informática Forense, Escola Superior de Tecnologia e Gestão, Instituto Politécnico de Leiria.

Para citar o software, ver [CITATION.cff](CITATION.cff).

## Licença

Distribuído sob a licença [MIT](LICENSE).

## Autor

**Rui Miguel Gonçalves Agostinho** — Mestrado em Cibersegurança e Informática Forense, IPL/ESTG
