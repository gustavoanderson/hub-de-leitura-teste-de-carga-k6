import http from 'k6/http';

export const options = {
  vus: 5,        // 5 "usuários virtuais" simultâneos
  duration: '10s', // rodando em loop por 10 segundos
};

export default function () {
  http.get('http://localhost:3000/api/books');
}
