import http from 'k6/http';
import {check, sleep} from 'k6';

export const options = {
  scenarios: {
    catalog_api: {
      executor: 'constant-arrival-rate',
      rate: 25,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
      maxVUs: 100
    },
    checkout: {
      executor: 'ramping-vus',
      exec: 'checkout',
      startVUs: 0,
      stages: [
        {duration: '30s', target: 10},
        {duration: '1m', target: 10},
        {duration: '30s', target: 0}
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:catalog_api}': ['p(95)<750'],
    'http_req_duration{scenario:checkout}': ['p(95)<1500']
  }
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3100';

export default function catalogApi() {
  const response = http.get(`${baseUrl}/api/v1/products`, {
    headers: signedHeaders('GET', '/api/v1/products', '')
  });
  check(response, {'catalog API is healthy': (result) => result.status === 200});
  sleep(0.2);
}

export function checkout() {
  if (!__ENV.AUTH_COOKIE || !__ENV.CHECKOUT_PAYLOAD) return;
  const body = __ENV.CHECKOUT_PAYLOAD;
  const response = http.post(`${baseUrl}/api/checkout`, body, {
    headers: {
      'content-type': 'application/json',
      cookie: __ENV.AUTH_COOKIE,
      origin: baseUrl,
      'sec-fetch-site': 'same-origin',
      'idempotency-key': `k6-${__VU}-${__ITER}`
    }
  });
  check(response, {
    'checkout accepted or safely rejected': (result) => [200, 201, 400, 409].includes(result.status)
  });
}

function signedHeaders() {
  // Set pre-signed headers through K6_API_HEADERS_JSON for live reseller tests.
  return __ENV.K6_API_HEADERS_JSON ? JSON.parse(__ENV.K6_API_HEADERS_JSON) : {};
}
