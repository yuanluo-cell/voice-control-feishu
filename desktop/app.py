"""Minimal menu-bar shell (Phase 4)."""

from __future__ import annotations

import logging
import sys

from PyQt6.QtGui import QAction, QIcon
from PyQt6.QtWidgets import QApplication, QMenu, QMessageBox, QSystemTrayIcon

LOG = logging.getLogger(__name__)


def run_tray() -> None:
    logging.basicConfig(level=logging.INFO)
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    tray = QSystemTrayIcon(QIcon())
    tray.setVisible(True)

    menu = QMenu()
    act_help = QAction("How to run smoke tests…")
    act_quit = QAction("Quit")

    def _help() -> None:
        QMessageBox.information(
            None,
            "voice-feishu",
            "语音：uv run python scripts/smoke_test.py\n"
            "带工具：uv run python scripts/smoke_test.py --with-tools\n"
            "上下文服务：uv run python -m desktop.context_server",
        )

    act_help.triggered.connect(_help)
    act_quit.triggered.connect(app.quit)
    menu.addAction(act_help)
    menu.addAction(act_quit)
    tray.setContextMenu(menu)

    try:
        from desktop.hotkey import register_hotkey_best_effort

        register_hotkey_best_effort(lambda: LOG.info("Hotkey ⌘⇧Space"))
    except Exception as exc:
        LOG.warning("Hotkey unavailable: %s", exc)

    tray.showMessage("voice-feishu", "菜单栏骨架已启动")
    app.exec()


def main() -> None:
    run_tray()


if __name__ == "__main__":
    main()
