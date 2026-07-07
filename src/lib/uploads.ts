import path from 'path';

// 업로드 루트 — 기본은 <cwd>/uploads, UPLOADS_DIR 환경변수로 재지정 가능
// (컨테이너에서 쓰기 가능한 볼륨이 다른 경로에 마운트된 경우 대응).
// DB에는 항상 'uploads/...' 상대 경로를 저장하고, 읽기/쓰기 시 이 루트로 치환한다.
export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
}

// DB 저장 경로('uploads/biz-certs/x.jpg')를 실제 파일 경로로 변환.
// 경로 조작 방지: 루트 밖을 가리키면 null.
export function resolveUploadPath(storedPath: string): string | null {
  const rel = storedPath.replace(/^uploads[\\/]/, '');
  const root = path.resolve(uploadsRoot());
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}
