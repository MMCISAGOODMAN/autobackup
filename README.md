# autobackup

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/MMCISAGOODMAN/autobackup)
[![Python](https://img.shields.io/badge/python-3.8%2B-green.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](LICENSE)

轻量、可靠的定时自动备份工具，支持 **MySQL**、**PostgreSQL** 数据库及**文件目录**备份，提供 CLI 命令行与 Web 管理界面。

> 仓库地址：[https://github.com/MMCISAGOODMAN/autobackup](https://github.com/MMCISAGOODMAN/autobackup)

---

## 目录

- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [安装部署](#安装部署)
- [快速开始](#快速开始)
- [命令行使用](#命令行使用)
- [Web 管理界面](#web-管理界面)
- [配置详解](#配置详解)
- [通知配置](#通知配置)
- [密码与安全](#密码与安全)
- [生产环境部署](#生产环境部署)
- [常见问题](#常见问题)
- [项目结构](#项目结构)
- [许可证](#许可证)

---

## 功能特性

| 类别 | 说明 |
|------|------|
| 备份源 | MySQL（mysqldump）、PostgreSQL（pg_dump）、文件目录（tar + gzip） |
| 调度 | Cron 表达式定时执行，支持 `--now` 立即备份、`--next` 查看下次执行时间 |
| 备份管理 | 时间戳命名、自动 gzip 压缩、按保留天数自动清理过期备份 |
| 通知 | 失败必通知，成功可选；支持邮件、钉钉、企业微信、飞书 |
| 日志 | 按天轮转，记录开始/结束时间、大小、状态、错误信息 |
| Web 界面 | 仪表盘、任务管理、备份浏览/下载/删除、执行历史、日志、在线配置 |
| 安全 | 环境变量/加密密码、备份文件权限 600、Web Token 认证 |

---

## 系统要求

### 运行环境

- **Python** 3.8 及以上（推荐 3.10+）
- **操作系统**：Linux / macOS / Windows（WSL 推荐）

> **macOS 注意**：系统默认没有 `python` 命令，请使用 `python3`。

### 外部工具（按需安装）

| 备份类型 | 所需命令 | 安装示例 |
|----------|----------|----------|
| MySQL | `mysqldump` | `brew install mysql-client` / `apt install mysql-client` |
| PostgreSQL | `pg_dump` | `brew install libpq` / `apt install postgresql-client` |
| 文件目录 | `tar`（系统自带） | — |

### Python 依赖

见 `requirements.txt`：PyYAML、croniter、requests、cryptography、Flask 等。

---

## 安装部署

### 方式一：从 GitHub 克隆（推荐）

```bash
git clone https://github.com/MMCISAGOODMAN/autobackup.git
cd autobackup
```

### 方式二：下载 Release

在 [Releases](https://github.com/MMCISAGOODMAN/autobackup/releases) 页面下载对应 tag 的源码包。

### 创建虚拟环境并安装依赖

```bash
# 创建虚拟环境
python3 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate          # Linux / macOS
# .venv\Scripts\activate           # Windows

# 安装依赖
pip install -r requirements.txt
```

### 初始化配置

```bash
cp config.example.yaml config.yaml
# 使用编辑器修改 config.yaml
```

---

## 快速开始

### 1. 设置敏感信息（推荐环境变量）

```bash
export MYSQL_PASSWORD='your_mysql_password'
export PG_PASSWORD='your_pg_password'
export WEB_TOKEN='your_web_token'        # 可选，保护 Web 界面
export SMTP_PASSWORD='your_smtp_password' # 如启用邮件通知
```

### 2. 验证配置

```bash
# 查看各任务下次执行时间
python3 autobackup.py -c config.yaml --next
```

预期输出示例：

```
2026-06-17 15:00:00 [INFO] 当前时间: 2026-06-17 15:00:00
2026-06-17 15:00:00 [INFO]   [mysql_prod] cron=0 2 * * * | 下次执行: 2026-06-18 02:00:00 (39600 秒后)
```

### 3. 立即执行一次备份

```bash
# 执行所有已启用任务
python3 autobackup.py -c config.yaml --now

# 仅执行指定任务
python3 autobackup.py -c config.yaml --now -t mysql_prod
```

### 4. 启动服务

```bash
# 方式 A：仅 CLI 调度器（前台运行）
python3 autobackup.py -c config.yaml

# 方式 B：Web 管理界面 + 后台调度器（推荐）
python3 autobackup.py -c config.yaml --web
```

浏览器访问：**http://localhost:8080**

---

## 命令行使用

### 完整参数列表

| 参数 | 说明 | 示例 |
|------|------|------|
| `-c, --config` | 配置文件路径（默认 `config.yaml`） | `-c /etc/autobackup/config.yaml` |
| `--now` | 立即执行备份 | `--now` |
| `-t, --task` | 指定任务名称（配合 `--now`） | `--now -t mysql_prod` |
| `--next` | 查看下次执行时间 | `--next` |
| `--web` | 启动 Web 管理界面 | `--web` |
| `--host` | Web 监听地址 | `--host 127.0.0.1` |
| `--port` | Web 监听端口 | `--port 9000` |
| `-v, --verbose` | 输出详细日志 | `-v` |
| `--encrypt-password` | 加密密码并输出 `enc:` 字符串 | `--encrypt-password 'secret'` |
| `--version` | 显示版本号 | `--version` |

### 常用场景

```bash
# 查看帮助
python3 autobackup.py --help

# 查看版本
python3 autobackup.py --version

# 加密数据库密码
export AUTOBACKUP_KEY='your-master-key'
python3 autobackup.py --encrypt-password 'db_password'
# 将输出的 enc:gAAAAA... 写入 config.yaml

# 单独启动 Web 服务
python3 web.py -c config.yaml --host 0.0.0.0 --port 8080
```

### Cron 表达式说明

格式：**分 时 日 月 周**（5 段，Linux 标准 cron）

| 表达式 | 含义 |
|--------|------|
| `0 2 * * *` | 每天凌晨 2:00 |
| `0 3 * * *` | 每天凌晨 3:00 |
| `0 4 * * 0` | 每周日 4:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 0 1 * *` | 每月 1 日 0:00 |

---

## Web 管理界面

启动 `--web` 后，在浏览器打开 `http://<host>:<port>` 即可使用。

### 功能页面

| 页面 | 功能 |
|------|------|
| **仪表盘** | 任务数、备份文件数、成功率、最近执行记录 |
| **备份任务** | 查看调度计划、立即备份、启用/禁用任务 |
| **备份文件** | 按任务筛选、下载、删除备份文件 |
| **执行历史** | 每次备份的开始时间、耗时、大小、状态 |
| **运行日志** | 实时查看日志（支持自动刷新） |
| **配置管理** | 在线编辑 YAML，保存后自动重载调度器 |

### Token 认证

在配置中设置：

```yaml
global:
  web:
    token: ${WEB_TOKEN}
```

或通过环境变量 `export WEB_TOKEN='your-token'`。

首次访问 API 时浏览器会提示输入 Token，验证通过后保存在本地。

### Web API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 系统状态 |
| GET | `/api/tasks` | 任务列表 |
| POST | `/api/tasks/{name}/run` | 立即执行 |
| POST | `/api/tasks/{name}/toggle` | 启用/禁用 |
| GET | `/api/backups` | 备份文件列表 |
| GET | `/api/backups/{file}/download` | 下载备份 |
| DELETE | `/api/backups/{file}` | 删除备份 |
| GET | `/api/history` | 执行历史 |
| GET | `/api/logs` | 运行日志 |
| GET/POST | `/api/config` | 读取/保存配置 |

---

## 配置详解

完整示例见 [`config.example.yaml`](config.example.yaml)。

### 全局配置 `global`

```yaml
global:
  backup_dir: ./backups       # 备份文件存放目录
  log_dir: ./logs             # 日志目录
  retention_days: 30          # 默认保留天数（过期自动删除）
  notify_on_success: false    # 备份成功时是否发送通知
  web:
    host: 0.0.0.0             # Web 监听地址
    port: 8080                # Web 监听端口
    token: ${WEB_TOKEN}       # 访问 Token（可选）
```

### 任务配置 `tasks`

每个任务支持以下字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 任务唯一名称，用于文件命名和 CLI `-t` 参数 |
| `type` | 是 | `mysql` / `postgresql` / `file` |
| `enabled` | 否 | 是否启用（默认 `true`） |
| `schedule` | 否 | Cron 表达式 |
| `retention_days` | 否 | 覆盖全局保留天数 |
| `backup_dir` | 否 | 覆盖全局备份目录 |
| `notify_on_success` | 否 | 覆盖全局成功通知设置 |

#### MySQL 任务

```yaml
- name: mysql_prod
  type: mysql
  enabled: true
  schedule: "0 2 * * *"
  retention_days: 7
  database:
    host: localhost
    port: 3306
    user: root
    password: ${MYSQL_PASSWORD}
    database: myapp
```

#### PostgreSQL 任务

```yaml
- name: pg_prod
  type: postgresql
  enabled: true
  schedule: "0 3 * * *"
  database:
    host: localhost
    port: 5432
    user: postgres
    password: ${PG_PASSWORD}
    database: myapp
```

#### 文件目录任务

```yaml
- name: nginx_config
  type: file
  enabled: true
  schedule: "0 4 * * 0"
  source: /etc/nginx           # 要备份的目录
  exclude:                     # 排除规则（fnmatch 模式）
    - "*.log"
    - "*.tmp"
```

### 备份文件命名规则

| 类型 | 格式 | 示例 |
|------|------|------|
| 数据库 | `{任务名}_{YYYYMMDD_HHMMSS}.sql.gz` | `mysql_prod_20260617_020001.sql.gz` |
| 文件 | `{任务名}_{YYYYMMDD_HHMMSS}.tar.gz` | `nginx_config_20260617_040001.tar.gz` |

备份文件权限自动设为 **600**（仅所有者可读写）。

---

## 通知配置

备份**失败时至少启用一种通知渠道**，否则仅记录日志。

### 邮件

```yaml
notification:
  email:
    enabled: true
    smtp_host: smtp.example.com
    smtp_port: 587
    use_tls: true
    username: backup@example.com
    password: ${SMTP_PASSWORD}
    from_addr: backup@example.com
    to_addrs:
      - admin@example.com
```

### 钉钉

```yaml
  dingtalk:
    enabled: true
    webhook: https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN
```

### 企业微信

```yaml
  wecom:
    enabled: true
    webhook: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
```

### 飞书

```yaml
  feishu:
    enabled: true
    webhook: https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_TOKEN
```

---

## 密码与安全

### 方式一：环境变量（推荐）

配置文件中引用：

```yaml
password: ${MYSQL_PASSWORD}
```

运行时注入：

```bash
export MYSQL_PASSWORD='your_password'
```

### 方式二：加密存储

```bash
export AUTOBACKUP_KEY='your-master-key'
python3 autobackup.py --encrypt-password 'your_password'
# 输出: enc:gAAAAAB...
```

写入配置：

```yaml
password: enc:gAAAAAB...
```

### 安全建议

1. **不要将** `config.yaml` 中的明文密码提交到 Git
2. 生产环境启用 `WEB_TOKEN` 保护管理界面
3. 备份目录权限设为仅 backup 用户可访问
4. 定期轮换数据库密码和 Token

---

## 生产环境部署

### systemd 服务（Web 模式）

```ini
# /etc/systemd/system/autobackup.service
[Unit]
Description=Auto Backup Service with Web UI
After=network.target

[Service]
Type=simple
User=backup
Group=backup
WorkingDirectory=/opt/autobackup
Environment=MYSQL_PASSWORD=xxx
Environment=PG_PASSWORD=xxx
Environment=WEB_TOKEN=xxx
ExecStart=/opt/autobackup/.venv/bin/python3 autobackup.py -c /opt/autobackup/config.yaml --web
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now autobackup
sudo systemctl status autobackup
```

### systemd 服务（仅 CLI 调度）

```ini
ExecStart=/opt/autobackup/.venv/bin/python3 autobackup.py -c /opt/autobackup/config.yaml
```

### 使用 crontab 替代内置调度器

若不想长期运行进程，可用系统 crontab 定时调用 `--now`：

```cron
0 2 * * * cd /opt/autobackup && .venv/bin/python3 autobackup.py -c config.yaml --now -t mysql_prod
```

---

## 常见问题

### `python: command not found`

macOS 默认没有 `python`，请使用：

```bash
python3 autobackup.py -c config.yaml --next
```

### `pip3 autobackup.py ...` 报错

`pip3` 用于安装包，不能运行脚本。正确用法：

```bash
pip3 install -r requirements.txt   # 安装依赖
python3 autobackup.py --now         # 运行程序
```

### `未找到 mysqldump / pg_dump`

安装对应数据库客户端，并确保命令在 `PATH` 中：

```bash
which mysqldump
which pg_dump
```

### `环境变量 XXX 未设置`

配置中使用了 `${XXX}` 但未 export。仅在**实际执行备份或发送通知**时才需要对应变量；查看 `--next` 不需要数据库密码。

### 备份失败但没有收到通知

检查 `notification` 中是否至少有一种渠道 `enabled: true`，且 webhook/SMTP 配置正确。

### Web 界面无法访问

1. 确认服务已启动：`python3 autobackup.py -c config.yaml --web`
2. 检查端口是否被占用
3. 若设置了 Token，需在浏览器中输入

---

## 项目结构

```
autobackup/
├── autobackup.py          # 核心程序：备份、调度、CLI
├── web.py                 # Web 服务与 REST API
├── config.example.yaml    # 配置文件示例
├── requirements.txt       # Python 依赖
├── templates/
│   └── index.html         # Web 管理界面
├── static/
│   ├── app.css            # 界面样式
│   └── app.js             # 前端逻辑
├── README.md              # 本文档
└── LICENSE                # MIT 许可证
```

运行时生成（已在 `.gitignore` 中）：

```
logs/                      # 日志与 history.json
backups/                   # 备份文件
config.yaml                # 本地配置（含敏感信息）
.venv/                     # Python 虚拟环境
```

---

## 许可证

[MIT License](LICENSE)

---

## 贡献与反馈

欢迎提交 Issue 和 Pull Request：[https://github.com/MMCISAGOODMAN/autobackup](https://github.com/MMCISAGOODMAN/autobackup)
