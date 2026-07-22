import type { FastifyReply } from "fastify";

/** 统一管理 API 响应 envelope：{ code, message, data, requestId? } */
export interface AdminEnvelope<T> {
  code: number;
  message: string;
  data: T | null;
  requestId?: string;
}

/** 从 reply 自动提取 requestId（Fastify 默认 genReqId） */
function getRequestId(reply: FastifyReply): string | undefined {
  return (reply.request as { id?: string }).id;
}

/** 成功响应 */
export function sendOk<T>(
  reply: FastifyReply,
  data: T,
  message = "ok",
  code = 200
): void {
  reply.status(code).send({
    code,
    message,
    data,
    requestId: getRequestId(reply),
  } satisfies AdminEnvelope<T>);
}

/** 201 Created 便捷封装 */
export function sendCreated<T>(
  reply: FastifyReply,
  data: T,
  message = "created"
): void {
  sendOk(reply, data, message, 201);
}

/** 错误响应 */
export function sendFail(
  reply: FastifyReply,
  code: number,
  message: string
): void {
  reply.status(code).send({
    code,
    message,
    data: null,
    requestId: getRequestId(reply),
  } satisfies AdminEnvelope<null>);
}
