# Shipin · 视频生成前端

基于 **React 19 + TypeScript + Vite** 的 AIGC 短视频创作台，对接火山方舟 Seedance 视频生成 API，并预留 Yobox 等多供应商扩展能力。

仓库根目录需求说明见 [../readme.md](../readme.md)；分步实现与面试复盘见 [../docs/开发指南.md](../docs/开发指南.md)、[../docs/面试总结.md](../docs/面试总结.md)。

---

## 功能概览

| 模块 | 路径 | 说明 |
|------|------|------|
| **创作台** | `/` | 对话式 UI、提示词与参考图、模型/时长、任务轮询、成片展示 |
| **API 调试** | `/api-test` | 火山方舟创建/查询任务的原型页 |
| **Yobox 联调** | `/yobox-test` | 第三方供应商接口测试 |
| **关于** | `/about` | 占位页 |

### 创作台（Studio）已实现

- 提示词输入（Enter 发送，Shift+Enter 换行）
- 参考图上传（JPEG/PNG/WebP/GIF，≤30MB）
- 参考视频（仅 Seedance 2.0 支持，当前创作台仅开放 **1.5 Pro**）
- 视频时长 **4–15 秒**
- 异步任务：**创建 → 轮询查询**（非流式 SSE）
- 任务取消：`queued` 可服务端取消；`running` 仅停止本地等待
- 生成记录：左侧可折叠侧栏（桌面）/ Drawer（移动端），`localStorage` 持久化
- 亮/暗主题切换

### 规划中（见根目录 readme）

- 可扩展供应商配置后台（IndexedDB / localStorage）
- Seedance 2.0 全量开放、多供应商 Registry

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 19、React Compiler |
| 语言 | TypeScript 6 |
| 构建 | Vite 8 |
| 路由 | TanStack Router（文件路由 + `routeTree.gen.ts`） |
| UI | Ant Design 6、Tailwind CSS 4 |
| 请求 | `fetch` 封装（`src/api/client.ts`） |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- 火山方舟 [API Key](https://www.volcengine.com/docs/82379/1541594?lang=zh)（创作台与 API 调试必需）

### 安装与运行

```bash
cd video-generation
npm install
cp .env.example .env   # 编辑填入 Key
npm run dev
```

浏览器访问终端提示的本地地址（通常为 `http://localhost:5173`）。

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（含 API 代理） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint |

---

## 环境变量

在 `video-generation/.env` 中配置（参考 [.env.example](./.env.example)）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_ARK_API_KEY` | 创作台/调试 | 火山方舟 Bearer Token |
| `VITE_ARK_BASE_URL` | 否 | 默认 `/api/ark`（走 Vite 代理） |
| `VITE_YOBOX_API_KEY` | Yobox 页 | Yobox Bearer Token |
| `VITE_YOBOX_BASE_URL` | 否 | 默认 `/api/yobox` |

> **安全提示**：`VITE_*` 会打进前端包，仅适合本地/内网调试。生产环境请使用 BFF 或网关代签，不要把 Key 暴露给浏览器。

修改 `.env` 后需**重启** `npm run dev`。

### Vercel 部署（重要）

1. **Root Directory** 设为 `video-generation`（若从 monorepo 根目录导入项目）。
2. 在 Vercel → Settings → Environment Variables 配置（Production / Preview 均勾选）：
   - `VITE_ARK_API_KEY` = 你的方舟 Key
   - `VITE_ARK_BASE_URL` = `/api/ark`（推荐，不要填火山完整域名，除非已处理 CORS）
3. **保存后必须 Redeploy**：`VITE_*` 在 `npm run build` 时写入 JS，改环境变量不重新构建不会生效。
4. 仓库已包含 [`vercel.json`](./vercel.json)，将 `/api/ark/*` 转发到 `https://ark.cn-beijing.volces.com/api/v3/*`（等价于本地 `vite.config.ts` 的 proxy）。

生产环境请求形如 `https://你的域名/api/ark/contents/...` 是**预期行为**（同源 + 服务端转发），不是没读到环境变量。真正写入构建产物的是 `VITE_ARK_API_KEY`；`VITE_ARK_BASE_URL` 未设置时默认也是 `/api/ark`。

---

## 路由

由 `src/routes/` 文件自动生成，入口 `src/main.tsx`：

```
/              → Studio 创作台
/api-test      → App.tsx 方舟调试
/yobox-test    → Yobox 联调
/about         → 关于
```

---

## 项目结构

```
src/
├── api/                      # HTTP 与第三方协议
│   ├── client.ts             # 方舟 arkRequest
│   ├── video-generation/     # 创建 / 查询 / 取消任务
│   └── yobox/                # Yobox 供应商
├── lib/
│   ├── ark-studio.ts         # 组 content、提交任务
│   ├── ark-models.ts         # 模型预设、开放列表
│   └── media-file.ts         # 上传校验、预览 URL
├── pages/
│   ├── Studio.tsx            # 主创作台
│   ├── App.tsx               # API 调试
│   └── YoboxTest.tsx
├── providers/AppTheme.tsx      # 主题 Context + Ant Design
├── types/studio.ts           # StudioJob 状态
└── routes/                   # TanStack 文件路由
```

---

## API 与异步任务

### 火山方舟（默认）

- 创建：`POST /api/v3/contents/generations/tasks` → 返回 `{ id }`
- 查询：`GET /api/v3/contents/generations/tasks/{id}` → `status`、`content.video_url`
- 取消：`DELETE`（仅 **排队中** 可真正取消；生成中无法中止）

开发环境请求路径：`/api/ark/...` → Vite 代理到 `https://ark.cn-beijing.volces.com/api/v3/...`（见 `vite.config.ts`）。

### 任务状态（前端）

| 状态 | 来源 | 说明 |
|------|------|------|
| `submitting` | 前端 | 正在调用创建接口 |
| `queued` / `running` | API | 排队 / 生成中，会轮询 |
| `succeeded` / `failed` / `expired` | API | 终态 |
| `cancelled` | 前端 | 用户取消或停止等待 |

轮询间隔默认 **4 秒**（`Studio.tsx` 中 `POLL_MS`）。

### Yobox

协议与方舟不同；需 `resolution` 等计费字段。若返回 `UNAUTHORIZED`，多为账户未开通对应计费渠道，需在 Yobox 控制台处理。

---

## 开发代理

`vite.config.ts` 中配置：

| 前端路径 | 代理目标 |
|----------|----------|
| `/api/ark` | `https://ark.cn-beijing.volces.com/api/v3` |
| `/api/yobox` | `https://api.yoboxai.com` |

用于规避浏览器 CORS。

**Vercel 生产环境**：`vite.config.ts` 的 `server.proxy` **不会**随构建生效，请使用项目根目录 [`vercel.json`](./vercel.json) 的 `rewrites`（已配置）。

---

## 主题

- `AppThemeProvider` 在 `html` 上切换 `.light` / `.dark`
- Tailwind 使用 CSS 变量：`--bg`、`--surface`、`--border`、`--accent` 等（`src/index.css`）
- Ant Design `ConfigProvider` 同步 `darkAlgorithm`

---

## 模型说明

| 模型 | 创作台 | 能力摘要 |
|------|--------|----------|
| Seedance 1.5 Pro | ✅ 默认开放 | 有声视频、图生视频（首帧） |
| Seedance 2.0 | 暂未开放 | 多模态、参考图/参考视频 |

模型与 `imageRole` 逻辑见 `src/lib/ark-models.ts`。

---

## 常见问题

### 未配置 API Key

页面顶部会出现警告。在 `.env` 设置 `VITE_ARK_API_KEY` 并重启 dev。

### 取消后任务仍在跑

- **排队中**：应调用 DELETE 并成功；若 `verifyArkTaskCancelled` 为 `still_active`，会继续轮询。
- **生成中**：火山官方不支持中止，仅「停止等待」，服务端可能继续计费。

### 主题切换背景不变

确保 `html` 上有 `.light` 或 `.dark`（由 `AppThemeProvider` 写入），勿仅用系统 `prefers-color-scheme` 覆盖手动主题。

### 构建失败：Router 类型

`tsconfig.app.json` 需开启 `strictNullChecks`（TanStack Router 要求）。

### Vercel 上接口 404 / 仍像没走环境变量

- 确认已部署含 `vercel.json` 的版本，且 `/api/ark` 未被 SPA 路由吞掉（`vercel.json` 中 API 规则在前）。
- 确认 `VITE_ARK_API_KEY` 在 Vercel 里已配置并 **Redeploy**。
- 不要把 `VITE_ARK_BASE_URL` 设为 `https://ark.cn-beijing.volces.com/...` 除非确认浏览器跨域可用；推荐保持 `/api/ark`。

---

## 部署到 Vercel

| 配置项 | 值 |
|--------|-----|
| Framework Preset | Vite |
| Root Directory | `video-generation` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| 环境变量 | `VITE_ARK_API_KEY`、`VITE_ARK_BASE_URL=/api/ark` |

---


## 相关文档

- [火山方舟 · 创建视频生成任务](https://www.volcengine.com/docs/82379/1520757?lang=zh)
- [火山方舟 · 取消任务](https://www.volcengine.com/docs/82379/1521720)
- [../docs/开发指南.md](../docs/开发指南.md)
- [../docs/面试总结.md](../docs/面试总结.md)

---

## License

Private project.
