export interface Config {
  apiBaseUrl: string
}

export const config: Config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api',
}
