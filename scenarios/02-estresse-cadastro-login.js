import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // aquecimento: sobe até 10 VUs
    { duration: '20s', target: 40 }, // sobe até 40 VUs
    { duration: '20s', target: 80 }, // sobe até o pico: 80 VUs
    { duration: '30s', target: 80 }, // segura 80 VUs por 30s (fase de estresse)
    { duration: '10s', target: 0 },  // resfriamento: desce a 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% das respostas devem ser < 500ms
    http_req_failed: ['rate<0.01'],   // menos de 1% de requisições com falha
  },
};

const BASE_URL = 'http://localhost:3000/api';

export default function () {
  // 1. Gera um e-mail único para esta execução (evita colisão entre usuários)
  const email = `usuario-${__VU}-${__ITER}-${Date.now()}@email.com`;

  // 2. Cria o usuário (POST /users)
  const createRes = http.post(
    `${BASE_URL}/users`,
    JSON.stringify({
      name: 'Usuario Teste k6',
      email: email,
      password: 'senha123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(createRes, {
    'criação: status 201': (r) => r.status === 201,
  });

  // 3. Faz login com o usuário recém-criado (POST /login)
  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({
      email: email,
      password: 'senha123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: token presente': (r) => !!r.json('token'),
  });
}
