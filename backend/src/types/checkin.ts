/** 签到活动状态 data 字段 */
export interface CheckinActivityData {
  active: boolean;
  today_checked_in: boolean;
  streak_days: number;
  daily_credit: number;
  today_credit: number;
  is_streak_day: boolean;
  next_streak_day: number;
  streak_bonus_days: number;
  streak_bonus_credit: number;
  checkin_dates: string[];
  week_checkin_days: number;
  week_progress: boolean[];
  total_credits: number;
  start_time: string;
  end_time: string;
  theme_name: string;
  season: number;
  activity_name: string;
  claim_button_text: string;
  action_button?: {
    show: boolean;
    text: string;
    action: string;
  };
}

/** checkin-activity-status 上游响应 */
export interface CheckinStatusResponse {
  code: number;
  msg: string;
  requestId?: string;
  data: CheckinActivityData;
}

/** daily-checkin 上游响应 */
export interface DailyCheckinResponse {
  code: number;
  msg: string;
  requestId?: string;
  data: {
    credit: number;
    streak_days: number;
    is_streak_day: boolean;
  };
}

/** 本地签到执行结果 */
export interface CheckinResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  credit?: number;
  streakDays?: number;
  totalCredits?: number;
  todayCheckedIn?: boolean;
  executedAt: string;
  credentialId?: string;
  credentialName?: string;
}
