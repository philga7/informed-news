import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import type { TLSSocket } from 'node:tls';

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

function isTrustedIpv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isTrustedIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1') return true;
  const first = lower.split(':')[0] ?? '';
  if (first === '') return false;
  const high = parseInt(first, 16);
  return high >= 0xfc00 && high <= 0xfdff;
}

export function isTrustedPeer(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const mapped = IPV4_MAPPED.exec(remoteAddress);
  const addr = mapped ? mapped[1]! : remoteAddress;
  const family = net.isIP(addr);
  if (family === 4) return isTrustedIpv4(addr);
  if (family === 6) return isTrustedIpv6(addr);
  return false;
}

export function sessionCookieShouldBeSecure(req: IncomingMessage): boolean {
  if (!isTrustedPeer(req.socket?.remoteAddress)) return false;
  if ((req.socket as TLSSocket | undefined)?.encrypted) return true;
  const raw = req.headers['x-forwarded-proto'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const first = header?.split(',')[0]?.trim().toLowerCase();
  return first === 'https';
}
