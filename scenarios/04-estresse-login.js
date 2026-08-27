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
const SENHA_PADRAO = 'senha123';
const QUANTIDADE_USUARIOS_DE_TESTE = 20;

// Roda 1 única vez, antes da carga começar. Cria os usuários que serão
// usados para logar durante o teste, e devolve a lista para o default().
export function setup() {
  const usuarios = [];

  for (let i = 0; i < QUANTIDADE_USUARIOS_DE_TESTE; i++) {
    const email = `login-${i}-${Date.now()}@email.com`;

    const res = http.post(
      `${BASE_URL}/users`,
      JSON.stringify({
        name: `Usuario Teste k6 - Login ${i}`,
        email: email,
        password: SENHA_PADRAO,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.status === 201) {
      usuarios.push({ email, password: SENHA_PADRAO });
    }
  }

  return { usuarios };
}

// Roda para cada VU/iteração, recebendo o que o setup() retornou.
export default function (data) {
  const usuario = data.usuarios[Math.floor(Math.random() * data.usuarios.length)];

  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({
      email: usuario.email,
      password: usuario.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: token presente': (r) => !!r.json('token'),
  });
}
