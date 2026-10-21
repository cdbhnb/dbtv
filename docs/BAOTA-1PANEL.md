# 宝塔 / 1Panel 部署

## 普通 Linux

安装 Node.js 20+、Git 和 SQLite。将项目放到 `/opt/dabiao-tv`，复制 `.env.example` 为 `.env`，然后执行：

```sh
npm ci
npm run build
npm start
```

首次打开站点会进入 `/install`。安装向导只允许在数据库没有用户时运行，管理员密码至少 8 位；完成后再次访问 `/install` 会失效。

## 宝塔

1. 创建 Node.js 项目，项目目录指向源码根目录，Node.js 选择 20 或更高版本。
2. 安装依赖 `npm ci`，启动文件使用 `npm start`，端口填 `.env` 中的 `PORT`（默认 8787）。
3. 在“网站”中新建反向代理，目标地址为 `http://127.0.0.1:8787`，开启 WebSocket 支持。
4. 把 `.env`、数据库文件和 `prisma/` 的运行数据放在项目外的备份目录；不要在面板文件管理器中公开下载 `.env`。

## 1Panel

推荐使用仓库中的 `compose.yaml`：

```sh
cp .env.example .env
docker compose up -d --build
```

容器会把 SQLite 数据写入 Docker 命名卷 `dabiao_data`。在 1Panel 的“网站”中反向代理到 `127.0.0.1:8787`，并开启 WebSocket。更新时执行 `docker compose up -d --build`，不要删除数据卷。

## Termux

保留原有手机部署方式：把源码放到 `~/web-tvbox`，执行 `sh scripts/termux-install.sh`。若要开机启动，安装 Termux:Boot 后，把下面内容保存为 `~/.termux/boot/dabiao-tv.sh`：

```sh
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd "$HOME/web-tvbox"
exec npm start
```

## 反向代理与视频播放

反向代理只转发大彪TV 的 HTTP API、静态页面和 WebSocket；视频 URL 仍由浏览器直接请求源站。若视频源需要鉴权、跨域或 Range 请求，应在源站或你自己的授权代理上配置 `Access-Control-Allow-Origin`、`Accept-Ranges` 和 HTTPS。项目不会绕过源站权限。

数据库备份：`sh scripts/backup.sh`。SQLite 迁移由 `npm start` 启动脚本执行 `prisma db push`，升级前请先备份。
