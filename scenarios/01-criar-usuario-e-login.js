import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  duration: '10s',
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
