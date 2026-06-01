"""Qt UI for low-distraction multiple-choice clarification (Phase 4 stub)."""

from __future__ import annotations

from PyQt6.QtWidgets import (
    QDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QVBoxLayout,
    QWidget,
)


def pick_option_modal(parent: QWidget | None, title: str, options: list[str]) -> int | None:
    """Return selected index or None if cancelled."""
    dlg = QDialog(parent)
    dlg.setWindowTitle(title)
    layout = QVBoxLayout(dlg)
    layout.addWidget(QLabel("请双击一项确认（或关闭窗口取消）："))
    lw = QListWidget()
    for opt in options:
        lw.addItem(QListWidgetItem(opt))
    layout.addWidget(lw)
    lw.setCurrentRow(0)

    def _pick(_item: QListWidgetItem | None = None) -> None:
        dlg.done(QDialog.DialogCode.Accepted)

    lw.itemDoubleClicked.connect(_pick)
    code = dlg.exec()
    if code != QDialog.DialogCode.Accepted:
        return None
    row = lw.currentRow()
    return row if row >= 0 else None
