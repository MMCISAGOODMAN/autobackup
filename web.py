#!/usr/bin/env python3
"""autobackup Web 管理界面"""

from __future__ import annotations

import os
import threading
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import yaml
from flask import Flask, jsonify, render_template, request, send_file

from autobackup import (
    HistoryStore,
    Notifier,
    Scheduler,
    __version__,
    build_task_info,
    execute_task,
    format_size,
    get_task_by_name,
    list_backup_files,
    load_config,
    save_config,
)

app = Flask(__name__, template_folder="templates", static_folder="static")

_state: Dict[str, Any] = {}
_run_lock = threading.Lock()


def _get_token() -> str:
    web_cfg = _state["config"].get("global", {}).get("web", {})
    token = web_cfg.get("token", "")
    if isinstance(token, str) and token.startswith("${") and token.endswith("}"):
        env_name = token[2:-1]
        return os.environ.get(env_name, "")
    return str(token or os.environ.get("WEB_TOKEN", ""))


def require_auth(view: Callable):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = _get_token()
        if token:
            provided = request.headers.get("X-Auth-Token") or request.args.get("token", "")
            if provided != token:
                return jsonify({"error": "未授权访问"}), 401
        return view(*args, **kwargs)
    return wrapper


def _reload_config() -> None:
    _state["config"] = load_config(_state["config_path"])
    scheduler = _state.get("scheduler")
    if scheduler:
        scheduler.reload_config(_state["config"])


def _global_cfg() -> Dict[str, Any]:
    return _state["config"].get("global", {})


def _safe_backup_path(filename: str) -> Optional[Path]:
    if ".." in filename or "/" in filename or "\\" in filename:
        return None
    for item in list_backup_files(_state["config"]):
        if item["filename"] == filename:
            return Path(item["path"])
    return None


def _run_task_async(task_name: str) -> bool:
    task = get_task_by_name(_state["config"], task_name)
    if not task:
        return False

    def _job():
        with _run_lock:
            execute_task(
                task,
                _global_cfg(),
                _state["notifier"],
                _state["logger"],
                _state["history"],
            )

    threading.Thread(target=_job, daemon=True, name=f"backup-{task_name}").start()
    return True


@app.route("/")
def index():
    return render_template("index.html", version=__version__)


@app.route("/api/status")
@require_auth
def api_status():
    config = _state["config"]
    global_cfg = _global_cfg()
    scheduler = _state.get("scheduler")
    history_stats = _state["history"].stats()
    tasks = config.get("tasks", [])
    backups = list_backup_files(config)
    total_size = sum(b["size_bytes"] for b in backups)

    return jsonify({
        "version": __version__,
        "scheduler_running": scheduler.is_running if scheduler else False,
        "task_count": len(tasks),
        "enabled_task_count": sum(1 for t in tasks if t.get("enabled", True)),
        "backup_count": len(backups),
        "total_backup_size_bytes": total_size,
        "total_backup_size_human": format_size(total_size),
        "history": history_stats,
        "backup_dir": global_cfg.get("backup_dir", "./backups"),
        "log_dir": global_cfg.get("log_dir", "./logs"),
        "auth_required": bool(_get_token()),
        "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })


@app.route("/api/tasks")
@require_auth
def api_tasks():
    global_cfg = _global_cfg()
    tasks = [
        build_task_info(task, global_cfg)
        for task in _state["config"].get("tasks", [])
    ]
    return jsonify({"tasks": tasks})


@app.route("/api/tasks/<name>/run", methods=["POST"])
@require_auth
def api_run_task(name: str):
    task = get_task_by_name(_state["config"], name)
    if not task:
        return jsonify({"error": f"任务不存在: {name}"}), 404
    if not _run_task_async(name):
        return jsonify({"error": "启动失败"}), 500
    return jsonify({"ok": True, "message": f"任务 {name} 已在后台启动"})


@app.route("/api/tasks/<name>/toggle", methods=["POST"])
@require_auth
def api_toggle_task(name: str):
    config = _state["config"]
    task = get_task_by_name(config, name)
    if not task:
        return jsonify({"error": f"任务不存在: {name}"}), 404
    task["enabled"] = not task.get("enabled", True)
    save_config(_state["config_path"], config)
    _reload_config()
    return jsonify({
        "ok": True,
        "enabled": task["enabled"],
        "message": f"任务 {name} 已{'启用' if task['enabled'] else '禁用'}",
    })


@app.route("/api/backups")
@require_auth
def api_backups():
    task = request.args.get("task")
    files = list_backup_files(_state["config"], task_name=task or None)
    return jsonify({"backups": files})


@app.route("/api/backups/<filename>/download")
@require_auth
def api_download_backup(filename: str):
    path = _safe_backup_path(filename)
    if not path or not path.exists():
        return jsonify({"error": "文件不存在"}), 404
    return send_file(path, as_attachment=True, download_name=filename)


@app.route("/api/backups/<filename>", methods=["DELETE"])
@require_auth
def api_delete_backup(filename: str):
    path = _safe_backup_path(filename)
    if not path or not path.exists():
        return jsonify({"error": "文件不存在"}), 404
    path.unlink()
    _state["logger"].info("Web 界面删除备份: %s", filename)
    return jsonify({"ok": True, "message": f"已删除 {filename}"})


@app.route("/api/history")
@require_auth
def api_history():
    limit = int(request.args.get("limit", 50))
    task = request.args.get("task")
    records = _state["history"].list(limit=limit, task_name=task or None)
    return jsonify({"history": records})


@app.route("/api/logs")
@require_auth
def api_logs():
    lines = int(request.args.get("lines", 200))
    log_dir = Path(_global_cfg().get("log_dir", "./logs"))
    log_file = log_dir / "autobackup.log"
    if not log_file.exists():
        return jsonify({"logs": "", "lines": 0})
    content = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
    tail = content[-lines:]
    return jsonify({"logs": "\n".join(tail), "lines": len(tail)})


@app.route("/api/config", methods=["GET"])
@require_auth
def api_get_config():
    with open(_state["config_path"], "r", encoding="utf-8") as fh:
        content = fh.read()
    return jsonify({"content": content})


@app.route("/api/config", methods=["POST"])
@require_auth
def api_save_config():
    data = request.get_json(silent=True) or {}
    content = data.get("content", "")
    if not content.strip():
        return jsonify({"error": "配置内容不能为空"}), 400
    try:
        parsed = yaml.safe_load(content)
        if not isinstance(parsed, dict):
            raise ValueError("配置必须是 YAML 对象")
    except Exception as exc:
        return jsonify({"error": f"YAML 格式错误: {exc}"}), 400

    save_config(_state["config_path"], parsed)
    _reload_config()
    _state["logger"].info("Web 界面更新了配置文件")
    return jsonify({"ok": True, "message": "配置已保存"})


def run_web_server(
    config_path: str,
    config: Dict[str, Any],
    logger,
    notifier: Notifier,
    history: HistoryStore,
    host: str = "0.0.0.0",
    port: int = 8080,
) -> None:
    _state["config_path"] = config_path
    _state["config"] = config
    _state["logger"] = logger
    _state["notifier"] = notifier
    _state["history"] = history

    scheduler = Scheduler(config, notifier, logger, history)
    scheduler.start_background()
    _state["scheduler"] = scheduler

    logger.info("Web 管理界面: http://%s:%d", host, port)
    logger.info("调度器已在后台运行")
    app.run(host=host, port=port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    import argparse
    from autobackup import setup_logging

    parser = argparse.ArgumentParser(description="autobackup Web 管理界面")
    parser.add_argument("-c", "--config", default="config.yaml")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    cfg = load_config(args.config)
    log_dir = cfg.get("global", {}).get("log_dir", "./logs")
    logger = setup_logging(log_dir)
    notifier = Notifier(cfg, logger)
    history = HistoryStore(log_dir)
    run_web_server(args.config, cfg, logger, notifier, history, args.host, args.port)
