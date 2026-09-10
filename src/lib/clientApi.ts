'use client';

export function redirectToLogin() {
  const path = window.location.pathname;
  const root = path.startsWith('/tech')
    ? '/tech'
    : path.startsWith('/partner')
      ? '/partner'
      : '/admin';
  window.location.assign(
    `${root}/login?returnTo=${encodeURIComponent(path + window.location.search)}`,
  );
}
export async function readApiJson<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    redirectToLogin();
    throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error ?? '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  if (body == null)
    throw new Error('응답을 확인하지 못했습니다. 다시 시도해 주세요.');
  return body as T;
}
export function requestError(error: unknown) {
  return error instanceof TypeError ||
    (error instanceof Error &&
      ['AbortError', 'TimeoutError'].includes(error.name))
    ? '연결을 확인해 주세요. 입력한 내용은 유지됩니다.'
    : error instanceof Error
      ? error.message
      : '처리하지 못했습니다. 다시 시도해 주세요.';
}
