"""独立视觉识图引擎：智谱等 OpenAI 兼容多模态；供一体化 / 其它业务复用。"""

from .service import (
    get_status,
    save_upload,
    understand,
    understand_paths,
)

__all__ = [
    "get_status",
    "save_upload",
    "understand",
    "understand_paths",
]
