import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { runCheckinWithActive } from "./checkin.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

/** 计算距下次本地 hour:minute 的毫秒数；若今日该时刻已过则排到次日 */
export function msUntilNext(
  hour: number,
  minute: number,
  from = new Date()
): number {
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - from.getTime();
}

async function runCheckinTask(): Promise<void> {
  if (running) {
    logger.warn("上一次签到任务仍在执行，跳过本轮");
    return;
  }
  running = true;
  try {
    logger.info("定时签到任务开始");
    const result = await runCheckinWithActive("scheduled");
    logger.info(
      {
        success: result.success,
        skipped: result.skipped,
        reason: result.reason,
        credit: result.credit,
        streakDays: result.streakDays,
      },
      "定时签到任务结束"
    );
  } catch (err) {
    logger.error({ err }, "定时签到任务异常");
  } finally {
    running = false;
  }
}

function scheduleNext(hour: number, minute: number): void {
  const delay = msUntilNext(hour, minute);
  const nextAt = new Date(Date.now() + delay);
  logger.info(
    { nextAt: nextAt.toISOString(), delayMs: delay },
    "下次签到计划已排定"
  );

  timer = setTimeout(async () => {
    await runCheckinTask();
    scheduleNext(hour, minute);
  }, delay);

  // 避免 timer 阻止进程退出（PM2 场景通常不需要，但本地调试更友好）
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function startScheduler(): void {
  const checkin = config.checkin;
  if (!checkin?.enabled) {
    logger.info("每日签到调度未启用 (checkin.enabled=false)");
    return;
  }

  const hour = checkin.hour ?? 9;
  const minute = checkin.minute ?? 5;

  logger.info({ hour, minute }, "启动每日签到调度");

  if (checkin.runOnStartupIfMissed) {
    // 启动后短延迟补跑一次：若今日已签到则内部会 skip
    setTimeout(() => {
      void runCheckinTask();
    }, 3000);
  }

  scheduleNext(hour, minute);
}

export function stopScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    logger.info("签到调度已停止");
  }
}
