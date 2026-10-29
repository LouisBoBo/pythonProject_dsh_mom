"""工作区项目画像：换目录即扫描，供写码 / 验证等读取。"""
from .service import ensure, format_directory_block, format_for_agent, get_profile, load_cached

__all__ = ["ensure", "format_directory_block", "format_for_agent", "get_profile", "load_cached"]
