import { getClientTimezone, clientTimezoneHeaders } from '../utils/timezone';

interface ErrorResponse {
  error?: string;
  details?: string[];
}

export class ApiError extends Error {
  status: number;
  details?: string[];

  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const baseFromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_BASE = (baseFromEnv && baseFromEnv.length > 0 ? baseFromEnv : window.location.origin).replace(
  /\/$/,
  ''
);

export function getApiBase() {
  return API_BASE;
}

export { getClientTimezone, clientTimezoneHeaders };

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('X-Client-Timezone')) {
    headers.set('X-Client-Timezone', getClientTimezone());
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const errorData = (data as ErrorResponse | undefined) ?? {};
    throw new ApiError(response.status, errorData.error ?? `HTTP ${response.status}`, errorData.details);
  }

  return data as T;
}
