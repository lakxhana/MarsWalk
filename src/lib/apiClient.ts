export class ApiRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiRequest<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {method, credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:value === undefined ? undefined : JSON.stringify(value)});
  } catch { throw new ApiRequestError('Could not reach the server. Check your connection and retry.', 0); }
  if (response.status === 401) throw new ApiRequestError('Sign in with your team username and password.', 401);
  if (response.status === 404) throw new ApiRequestError('The mission API is missing. Deploy the updated project, including its api folder.', 404);
  if (response.status === 413) throw new ApiRequestError('Upload too large. Use a smaller photo or shorter recording.', 413);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(data?.error || 'The server could not open the database. Check the deployment logs.', response.status);
  if (data === null && !response.headers.get('content-type')?.includes('application/json')) throw new ApiRequestError('The server returned a page instead of mission data. Check the API deployment.', 502);
  return data as T;
}
