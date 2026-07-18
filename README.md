# WorkBuddy2Api

将 CodeBuddy 桌面端的 GLM 5.2 额度封装为**标准 OpenAI 兼容 API**，让 ChatBox、OpenCat、Open WebUI 等第三方客户端可以复用 CodeBuddy 的 AI 能力。

## 快速开始

```bash
cd backend

# 安装依赖
npm install

# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

服务默认运行在 `http://127.0.0.1:11434`。

## 使用 PM2 守护

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start ecosystem.config.cjs

# 查看状态
pm2 status

# 停止
pm2 stop workbuddy2api
```

## OpenAI 客户端配置

在 ChatBox / OpenCat / Open WebUI 等客户端中配置：

- **API 地址**: `http://127.0.0.1:11434/v1`
- **API Key**: 留空或填任意值（服务端不校验）
- **模型**: `auto` 或 `glm-5.2`

## 管理 API

| 端点 | 说明 |
|------|------|
| `GET /admin/credentials` | 列出所有凭证 |
| `POST /admin/credentials` | 添加 ck_xxx Key |
| `DELETE /admin/credentials/:id` | 删除凭证 |
| `PUT /admin/credentials/:id/activate` | 切换活跃凭证 |

### 添加凭证示例

```bash
curl -X POST http://127.0.0.1:11434/admin/credentials \
  -H "Content-Type: application/json" \
  -d '{"name":"备用Key","key":"ck_xxxxxx"}'
```

## 凭证来源

1. **自动发现**：启动时自动读取 `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`
2. **手动添加**：通过管理 API 添加 `ck_xxx` 格式的 Key

## 配置

编辑 `config.json` 修改端口和日志级别：

```jsonc
{
  "server": { "port": 11434, "host": "127.0.0.1" },
  "log": { "level": "info" }
}
```
