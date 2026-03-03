declare module 'xss-clean' {
  import type { RequestHandler } from 'express';

  export default function xssClean(): RequestHandler;
}

declare module 'xss-clean/lib/xss' {
  export function clean<T = unknown>(value?: T): T;
}
