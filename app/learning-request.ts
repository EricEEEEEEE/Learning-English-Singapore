export class LearningRequestFailure extends Error {
  constructor(readonly status: number) { super('Learning request failed'); }
}

export async function requestLearningJson(url: string, controller: AbortController, body?: object) {
  const deadline = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { method: body ? 'PUT' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (response.status === 401) window.dispatchEvent(new Event('le-sg-auth-invalid'));
    if (!response.ok) throw new LearningRequestFailure(response.status);
    return await response.json();
  } finally { window.clearTimeout(deadline); }
}
