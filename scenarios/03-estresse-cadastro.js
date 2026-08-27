import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 40 },
    { duration: '20s', target: 80 },
    { duration: '30s', target: 80 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:3000/api';

export default function () {
  const email = `cadastro-${__VU}-${__ITER}-${Date.now()}@email.com`;

  const createRes = http.post(
    `${BASE_URL}/users`,
    JSON.stringify({
      name: 'Usuario Teste k6 - Cadastro',
      email: email,
      password: 'senha123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(createRes, {
    'criação: status 201': (r) => r.status === 201,
  });
}
