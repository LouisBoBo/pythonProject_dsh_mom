#!/usr/bin/env python3
"""port_listen 能解析本机监听（不测停进程）。"""
from __future__ import annotations

import os
import socket
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from port_listen import listening_pid  # noqa: E402


class PortListenTests(unittest.TestCase):
    def test_finds_bound_port(self):
        sock = socket.socket()
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        port = sock.getsockname()[1]
        try:
            pid = listening_pid(port)
            if pid is None:
                self.skipTest("本机 lsof/netstat 未返回监听 PID")
            self.assertEqual(pid, os.getpid())
        finally:
            sock.close()


if __name__ == "__main__":
    unittest.main()
