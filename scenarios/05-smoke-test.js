import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<300'], // carga mínima: resposta deve ser rápida
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],            // checks também podem virar threshold
  },
};

const BASE_URL = 'http://localhost:3000/api';

export default function () {
  // 1. Login como administrador
  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ email: 'admin@biblioteca.com', password: 'admin123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(loginRes, {
    'login admin: status 200': (r) => r.status === 200,
    'login admin: token presente': (r) => !!r.json('token'),
  });
  const token = loginRes.json('token');

  // 2. Listar livros (endpoint público)
  const booksRes = http.get(`${BASE_URL}/books`);
  check(booksRes, {
    'livros: status 200': (r) => r.status === 200,
    'livros: retorna lista': (r) => Array.isArray(r.json('books')),
  });

  // 3. Listar usuários (endpoint autenticado)
  const usersRes = http.get(`${BASE_URL}/users`, {
    headers: { Authorization: token },
  });
  check(usersRes, {
    'usuários: status 200': (r) => r.status === 200,
  });

  // 4. Cadastrar um novo usuário e logar com ele
  const email = `smoke-${__VU}-${__ITER}-${Date.now()}@email.com`;

  const createRes = http.post(
    `${BASE_URL}/users`,
    JSON.stringify({ name: 'Usuario Smoke Test', email, password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(createRes, {
    'cadastro: status 201': (r) => r.status === 201,
  });

  const novoLoginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ email, password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(novoLoginRes, {
    'login novo usuário: status 200': (r) => r.status === 200,
  });
}
