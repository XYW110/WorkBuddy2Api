import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { OpenAIChatRequest, OpenAIChatChunk } from "../types/openai.js";
import * as credentials from "../services/credential-store.js";
import {
  openaiToCodeBuddy,
  codeBuddySSEToOpenAIChunk,
  createDoneSSE,
  chunksToOpenAIResponse,
} from "../services/translate.js";
import { streamRequest, refreshAccessToken } from "../services/proxy.js";
import { logger } from "../utils/logger.js";
import { getCheapestModel } from "./models.js";
import { loadAlias } from "../services/leaderboard/index.js";

/** 带自动刷新重试的流式请求包装器 */
function doStreamRequest(
  cred: ReturnType<typeof credentials.getActive>,
  codebuddyReq: ReturnType<typeof openaiToCodeBuddy>,
  onData: (line: string) => void,
  onEnd: () => void,
  onError: (err: Error) => void
): void {
  if (!cred) {
    onError(new Error("无可用凭证"));
    return;
  }

  // 只对 local-file 凭证尝试自动刷新
  const canRefresh = cred.type === "local-file" && !!cred.accessToken;

  streamRequest(
    cred,
    codebuddyReq,
    onData,
    onEnd,
    onError,
    canRefresh
      ? () => {
          // onAuthError 回调：在 streamRequest 检测到 401/403 时触发
          logger.warn("上游认证失败，尝试刷新 token 后重试");
          refreshAccessToken(cred)
            .then(({ accessToken, refreshToken }) => {
              credentials.updateCredentialToken(
                cred.id,
                accessToken,
                refreshToken
              );
              const refreshedCred = { ...cred, accessToken, refreshToken };
              // 用新 token 重试，不再传 onAuthError 防止无限循环
              streamRequest(
                refreshedCred,
                codebuddyReq,
                onData,
                onEnd,
                onError
              );
            })
            .catch((refreshErr) => {
              logger.error({ err: refreshErr }, "token 刷新失败");
            });
        }
      : undefined
  );
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/chat/completions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const cred = credentials.getNextRoundRobin();
      if (!cred) {
        return reply.status(401).send({ error: "无可用凭证，请先配置" });
      }

      const openaiReq = req.body as OpenAIChatRequest;
      if (!openaiReq.messages || !Array.isArray(openaiReq.messages)) {
        return reply.status(400).send({ error: "缺少 messages 字段" });
      }

      let model = openaiReq.model || "auto";

      // auto-cheapest 路由：替换为每日筛选出的经济别名模型
      if (model === "auto-cheapest") {
        const state = loadAlias();
        const target = state?.selectedModelId ?? getCheapestModel();
        if (!target) {
          return reply
            .status(503)
            .send({ error: "auto-cheapest: 无可用模型（筛选未产生结果且无兜底）" });
        }
        openaiReq.model = target;
        model = target;
        logger.info(
          { target, tier: state?.tier ?? "fallback", reason: state?.reason ?? null },
          "auto-cheapest 路由到经济别名模型"
        );
      }

      const codebuddyReq = openaiToCodeBuddy(openaiReq);
      const isStreaming = openaiReq.stream === true;

      logger.info({ model, stream: isStreaming }, "收到聊天请求");

      if (isStreaming) {
        // 流式响应：直接 SSE 逐块转发
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        let chunkIndex = 0;

        doStreamRequest(
          cred,
          codebuddyReq,
          (dataLine) => {
            const sse = codeBuddySSEToOpenAIChunk(
              dataLine,
              model,
              chunkIndex++
            );
            if (sse) {
              reply.raw.write(sse);
            }
          },
          () => {
            reply.raw.write(createDoneSSE());
            reply.raw.end();
          },
          (err) => {
            logger.error({ err }, "上游流式请求出错");
            reply.raw.write(
              `data: ${JSON.stringify({ error: err.message })}\n\n`
            );
            reply.raw.write(createDoneSSE());
            reply.raw.end();
          }
        );
      } else {
        // 非流式：收集所有 chunks 后聚合返回
        const chunks: OpenAIChatChunk[] = [];
        let chunkIndex = 0;

        await new Promise<void>((resolve) => {
          doStreamRequest(
            cred,
            codebuddyReq,
            (dataLine) => {
              const sseStr = codeBuddySSEToOpenAIChunk(
                dataLine,
                model,
                chunkIndex++
              );
              if (sseStr) {
                // 从 SSE 字符串中反解析出 chunk 对象
                const jsonStr = sseStr.replace(/^data: /, "").trim();
                if (jsonStr) {
                  try {
                    chunks.push(JSON.parse(jsonStr));
                  } catch {
                    /* 忽略解析失败的 chunk */
                  }
                }
              }
            },
            () => {
              const response = chunksToOpenAIResponse(chunks, model);
              reply.send(response);
              resolve();
            },
            (err) => {
              logger.error({ err }, "上游非流式请求出错");
              reply.status(502).send({ error: `上游错误: ${err.message}` });
              resolve();
            }
          );
        });
        return reply;
      }
    }
  );
}
