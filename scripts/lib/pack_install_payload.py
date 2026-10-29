"""把安装时文件数最多的两棵目录打成未压缩 zip。

NSIS 会先把安装包解到临时目录，再 robocopy 到安装目录。Python 与宿主
node_modules 一共一万多个小文件，这条路径会写两遍，杀毒也会扫两遍。
这里改成各一个 zip：外层安装包仍负责压缩，安装程序再用系统 tar 在最终目录
展开一次。源目录保持不动，开发运行和戳记复用不受影响。
"""
from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path


def tree_fingerprint(src: Path) -> str:
    """路径、大小、mtime。内容没改就不必重新打包。"""
    h = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames.sort()
        for name in sorted(filenames):
            path = Path(dirpath) / name
            try:
                st = path.stat()
            except OSError:
                continue
            rel = path.relative_to(src).as_posix()
            h.update(rel.encode("utf-8", "surrogateescape"))
            h.update(b"\0")
            h.update(str(st.st_size).encode("ascii"))
            h.update(b"\0")
            h.update(str(getattr(st, "st_mtime_ns", int(st.st_mtime * 1e9))).encode("ascii"))
            h.update(b"\n")
    return h.hexdigest()


def ensure_stored_zip(src: Path, dest: Path) -> str:
    """写成 ZIP_STORED。外层 7z 再压缩；安装时 tar 只做一次顺序写出。"""
    src = Path(src)
    dest = Path(dest)
    if not src.is_dir():
        raise FileNotFoundError(f"缺少要打包的目录: {src}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    fp = tree_fingerprint(src)
    stamp = dest.with_name(dest.name + ".stamp")
    if dest.is_file() and stamp.is_file() and stamp.read_text(encoding="utf-8").strip() == fp:
        return "reuse"
    tmp = dest.with_name(dest.name + ".tmp")
    if tmp.exists():
        tmp.unlink()
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        for dirpath, dirnames, filenames in os.walk(src):
            dirnames.sort()
            for name in sorted(filenames):
                path = Path(dirpath) / name
                if not path.is_file():
                    continue
                zf.write(path, path.relative_to(src).as_posix())
    tmp.replace(dest)
    stamp.write_text(fp + "\n", encoding="utf-8", newline="\n")
    return "packed"
