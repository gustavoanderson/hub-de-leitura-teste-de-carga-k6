# Teste de carga com k6 — API Hub de Leitura

Projeto de teste de carga (load/stress testing) construído com [k6](https://k6.io/), da Grafana Labs, contra uma API local de gestão de biblioteca (Hub de Leitura), rodando em `http://localhost:3000/api`.

O objetivo aqui não é validar comportamento funcional da API (isso é coberto em um projeto separado de testes de API com Cypress), e sim medir **como a API se comporta sob múltiplos usuários simultâneos**: tempo de resposta, taxa de erro e ponto de degradação.

O processo de construção passo a passo, com as descobertas de cada teste, está documentado em [`DIARIO-DE-APRENDIZADO.md`](./DIARIO-DE-APRENDIZADO.md).

## Pré-requisitos

- [k6](https://k6.io/docs/get-started/installation/) instalado.
  - Windows: `winget install k6 --source winget`
- A API do Hub de Leitura rodando localmente em `http://localhost:3000`.
- Um usuário administrador válido na API (usado nos testes que dependem de login): `admin@biblioteca.com` / `admin123`.

## Cenários disponíveis

| Arquivo | O que faz | Carga |
|---|---|---|
| [`scenarios/00-primeiro-teste.js`](scenarios/00-primeiro-teste.js) | Teste introdutório: lista livros (`GET /books`) | 5 VUs por 10s |
| [`scenarios/01-criar-usuario-e-login.js`](scenarios/01-criar-usuario-e-login.js) | Fluxo de cadastro + login, carga leve, para validar o script | 5 VUs por 10s |
| [`scenarios/02-estresse-cadastro-login.js`](scenarios/02-estresse-cadastro-login.js) | Estresse: cadastro + login no mesmo fluxo, com `thresholds` | Rampa até 80 VUs |
| [`scenarios/03-estresse-cadastro.js`](scenarios/03-estresse-cadastro.js) | Estresse isolado de `POST /users` (cadastro) | Rampa até 80 VUs |
| [`scenarios/04-estresse-login.js`](scenarios/04-estresse-login.js) | Estresse isolado de `POST /login`, usando `setup()` para pré-criar usuários de teste | Rampa até 80 VUs |
| [`scenarios/05-smoke-test.js`](scenarios/05-smoke-test.js) | Smoke test: valida os fluxos críticos (login, livros, usuários, cadastro) com carga mínima e thresholds rígidos | 2 VUs por 30s |

## Como rodar

```bash
k6 run scenarios/00-primeiro-teste.js
k6 run scenarios/02-estresse-cadastro-login.js
```

Cada execução imprime um resumo no terminal com as métricas (`http_req_duration`, `http_req_failed`, `checks`) e, nos cenários com `thresholds`, uma seção `THRESHOLDS` indicando aprovação (✓) ou reprovação (✗) — a execução termina com código de saída diferente de zero quando algum threshold é violado, o que permite usar esses testes como gate em pipelines de CI/CD.

## Aviso importante

Os cenários de cadastro (`01`, `02`, `03`, `04`) criam usuários **reais** no banco de dados da API a cada execução (não há mock). Rodar os testes de estresse repetidas vezes acumula milhares de registros no banco local. Isso é esperado neste projeto de estudo, mas é bom ter em mente antes de rodar em outro ambiente.

## Principais descobertas até agora

- A API não retorna erros sob carga (0% de falhas em todos os testes até 80 VUs simultâneos), mas seu tempo de resposta degrada fortemente: de ~90ms (carga leve) para ~1-2s (80 VUs) nos endpoints de cadastro/login.
- O gargalo é o hash de senha (bcrypt), usado tanto em `POST /users` quanto em `POST /login` — ambos endpoints escalam mal sob concorrência pelo mesmo motivo.
- Cadastro e login concorrendo ao mesmo tempo (cenário `02`) degradam mais do que a soma dos dois isolados (cenários `03` e `04`), por disputarem o mesmo recurso de CPU.

Detalhes completos de cada descoberta, com números, em [`DIARIO-DE-APRENDIZADO.md`](./DIARIO-DE-APRENDIZADO.md).
