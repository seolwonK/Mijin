import type { NextConfig } from "next";
import os from "os";

// next dev를 폰(내부 IP)에서 열 때 dev 에셋의 교차 출처 요청을 허용
const lanIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...lanIPs],
};

export default nextConfig;
