import { SERVER_URL } from '../auth/api';

/** Socket.IO is exposed by the same Nest application as the REST API. */
export function socketBaseUrl() {
  return SERVER_URL.trim().replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
}
