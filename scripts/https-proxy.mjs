// 로컬 HTTPS 프록시 — 폰 등 같은 네트워크 기기에서 위치·마이크 권한을 쓰기 위한 용도.
// (브라우저는 위치/마이크를 HTTPS 또는 localhost에서만 허용한다)
//
// 사용법:
//   npm run dev            # 또는 npm start (앱 서버, 기본 3000)
//   npm run https-proxy    # → https://<내부IP>:3443 을 폰에서 접속
//
// 환경변수: TARGET_PORT(기본 3000), HTTPS_PORT(기본 3443)
// 인증서는 certs/ 에 자동 생성(자체 서명). 내부 IP가 바뀌면 자동 재발급.
// 폰 첫 접속 시 "안전하지 않음" 경고는 1회 수락하면 된다(자체 서명이라 정상).
// 실배포에서는 이 스크립트 대신 정식 인증서(Vercel/Caddy/Nginx+Let's Encrypt)를 쓸 것.

import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET_PORT = Number(process.env.TARGET_PORT ?? 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);

const certDir = path.join(process.cwd(), 'certs');
const keyPath = path.join(certDir, 'local-key.pem');
const certPath = path.join(certDir, 'local-cert.pem');
const sanPath = path.join(certDir, 'san.txt');

function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function ensureCert() {
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanIPs().map((ip) => `IP:${ip}`)].join(',');
  const fresh =
    existsSync(keyPath) &&
    existsSync(certPath) &&
    existsSync(sanPath) &&
    readFileSync(sanPath, 'utf8') === san;
  if (fresh) return;

  mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '365', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=mijin-local',
    '-addext', `subjectAltName=${san}`,
  ]);
  writeFileSync(sanPath, san);
  console.log(`[https-proxy] 자체 서명 인증서 생성 (${san})`);
}

ensureCert();

const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (req, res) => {
    const proxyReq = httpRequest(
      {
        host: '127.0.0.1',
        port: TARGET_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          'x-forwarded-for': req.socket.remoteAddress ?? '',
          'x-forwarded-proto': 'https',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`대상 서버가 없습니다. 포트 ${TARGET_PORT}에서 앱이 실행 중인지 확인하세요.`);
    });
    req.pipe(proxyReq);
  },
);

// WebSocket 업그레이드 중계 (next dev HMR용)
server.on('upgrade', (req, socket, head) => {
  const upstream = connect(TARGET_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log(`[https-proxy] http://127.0.0.1:${TARGET_PORT} ← https 중계 시작`);
  console.log('[https-proxy] 폰에서 접속할 주소:');
  for (const ip of lanIPs()) console.log(`  https://${ip}:${HTTPS_PORT}`);
});
