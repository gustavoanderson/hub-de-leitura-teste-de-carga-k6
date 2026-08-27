# Diário de aprendizado — Teste de carga com k6

Registro dos passos que fomos construindo juntos, na ordem em que aconteceram, para servir de referência e para documentar o projeto quando ele for para o GitHub.

## Passo 1 — Cypress vs. k6

- Cypress: faz 1 requisição por vez, valida **comportamento** (status, corpo da resposta).
- k6: dispara **muitas requisições simultâneas** (VUs = Virtual Users), valida **performance** sob carga (tempo de resposta, taxa de erro).

## Passo 2 — Primeiro script e leitura da saída do k6

Arquivo: [`scenarios/00-primeiro-teste.js`](scenarios/00-primeiro-teste.js)

Script mínimo, sem `options` (roda 1 VU, 1 iteração por padrão):

```js
import http from 'k6/http';

export default function () {
  http.get('http://localhost:3000/api/books');
}
```

Métricas principais do resumo do k6:
- `http_req_duration` — tempo de resposta (`avg`, `p(95)`, `max`...). **p(95) é a métrica mais usada** em critérios de aprovação.
- `http_req_failed` — % de requisições que falharam.
- `http_reqs` — total de requisições e taxa por segundo.
- `iterations` — quantas vezes a função `default` completa rodou.

## Passo 3 — `options`: vus + duration

Adicionamos carga real ao mesmo script:

```js
export const options = {
  vus: 5,          // 5 usuários virtuais simultâneos
  duration: '10s',  // rodando em loop por 10 segundos
};
```

- **VU** = como uma aba de navegador: roda a função `default` do começo ao fim, em loop, até acabar o tempo/iterações definidos.
- Resultado: 7710 iterações em 10s, `http_req_duration` p(95) subiu de 2ms (1 requisição) para 9.32ms (carga real, com concorrência).

## Passo 4 — Entendendo os imports

Arquivo: [`scenarios/01-criar-usuario-e-login.js`](scenarios/01-criar-usuario-e-login.js)

```js
import http from 'k6/http';   // default import — k6/http exporta 1 coisa só (o objeto http)
import { check } from 'k6';   // named import — k6 exporta várias coisas (check, sleep, group...)
```

- `k6` e `k6/http` são módulos **embutidos no binário do k6**, não vêm do `node_modules`. O k6 não roda em Node.js — tem seu próprio motor JS.
- `check()` é como o `expect` do Cypress, mas **nunca quebra o teste** ao falhar — só registra pass/fail na métrica `checks`. Isso é proposital: em teste de carga você quer ver o panorama geral, não parar no primeiro erro.

## Passo 5 — Fluxo de negócio: criar usuário + login

Mesmo arquivo do passo 4. Lógica:
1. Gera e-mail único por iteração: `` `usuario-${__VU}-${__ITER}-${Date.now()}@email.com` `` (`__VU` e `__ITER` são variáveis globais do k6).
2. `POST /users` — cria o usuário (precisa de `JSON.stringify()` no corpo e header `Content-Type: application/json` manualmente — o k6 não serializa sozinho como o `cy.api()` do Cypress).
3. `POST /login` — loga com o usuário recém-criado.
4. `check()` em cada resposta (status esperado, presença do token).

**Descoberta importante:** os usuários criados pelo k6 são **gravados de verdade** no banco da API (confirmado consultando `GET /users` depois). Cada rodada de teste acumula mais usuários no banco.

**Também importante:** como a API roda em `localhost`, o k6 (gerador de carga) e a API (alvo) disputam os mesmos recursos da máquina (CPU, RAM). Diferente de um teste de carga "de produção", onde gerador e alvo ficam em máquinas separadas.

Resultado com 5 VUs / 10s: `http_req_duration` avg = **91.66ms** — bem mais lento que o `/books` (6.4ms), porque criar usuário + logar envolve **hash de senha** (bcrypt), que é propositalmente uma operação cara de CPU.

## Passo 6 — Teste de estresse com `stages` (80 VUs)

Arquivo: [`scenarios/02-estresse-cadastro-login.js`](scenarios/02-estresse-cadastro-login.js)

```js
export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 40 },
    { duration: '20s', target: 80 }, // pico: 80 VUs simultâneos
    { duration: '30s', target: 80 }, // segura o pico
    { duration: '10s', target: 0 },  // resfriamento
  ],
};
```

- `stages` sobe/desce a quantidade de VUs **gradualmente**, ao contrário do `vus` fixo. Isso permite observar em que ponto a API começa a degradar.

**Resultado (2477 iterações, 4954 requisições, 90s):**
- `checks_succeeded`: 100% — **nenhuma requisição falhou por status incorreto**.
- Mas `http_req_duration` **disparou**: avg = 928.59ms, p(95) = **1.97s**, max = 2.38s (contra p(95)=122ms com 5 VUs).

**Conclusão-chave:** a API não "quebrou" (0% de erro), mas **degradou fortemente em tempo de resposta** sob 80 usuários simultâneos criando conta + logando. Isso mostra por que só validar `status === 200` não é suficiente em teste de carga — é preciso também definir um critério de performance aceitável (ex: "95% das respostas devem ficar abaixo de Xms"). Isso nos leva ao próximo passo: **thresholds**.

## Passo 7 — `thresholds`: critérios de aprovação de performance

Adicionamos ao mesmo arquivo (`scenarios/02-estresse-cadastro-login.js`):

```js
thresholds: {
  http_req_duration: ['p(95)<500'], // 95% das respostas devem ser < 500ms
  http_req_failed: ['rate<0.01'],   // menos de 1% de requisições com falha
},
```

- `check()` avalia cada resposta individual e nunca reprova o teste sozinho.
- `threshold` avalia uma **métrica agregada** e, se violada, **reprova o teste inteiro** (aparece `✗` vermelho, e o processo termina com código de saída diferente de zero — é isso que uma pipeline de CI/CD usaria para bloquear um deploy automaticamente).

**Resultado:** exatamente como previsto —
```
█ THRESHOLDS
    http_req_duration
    ✗ 'p(95)<500' p(95)=1.93s      ← REPROVADO

    http_req_failed
    ✓ 'rate<0.01' rate=0.00%       ← APROVADO
```
Saída terminou com `level=error msg="thresholds on metrics 'http_req_duration' have been crossed"` e código de saída 99.

**Conclusão de QA:** a API do Hub de Leitura **não erra** sob 80 usuários simultâneos cadastrando+logando, mas **não escala em velocidade** — passa de ~90ms de resposta média (5 VUs) para quase 1s de média (80 VUs), reprovando um critério razoável de UX (p95 < 500ms).

## Passo 9 — Smoke test: carga mínima, thresholds rígidos

Arquivo: [`scenarios/05-smoke-test.js`](scenarios/05-smoke-test.js)

Diferente do teste de estresse (carga alta, achar o ponto de quebra), o smoke test usa **carga mínima** (2 VUs, 30s) para confirmar que os fluxos críticos continuam funcionando **e respondendo rápido**, antes de rodar testes mais pesados — é o "será que ligou?" que roda rápido e barato, ideal para CI/CD a cada push.

Cobre 4 fluxos num único teste: login do admin, listar livros, listar usuários (autenticado), cadastro + login de um novo usuário.

Novidade: threshold em cima da métrica `checks`, não só de HTTP:
```js
thresholds: {
  http_req_duration: ['p(95)<300'], // rígido, porque a carga é mínima
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],            // une check() e threshold no mesmo critério
},
```

**Resultado:** todos os thresholds aprovados — `checks=100%`, `p(95)=93.1ms` (bem abaixo do limite de 300ms), `http_req_failed=0%`. Confirma que a base da API está saudável.
