1. Primary goal: 在 /Users/joe/Documents/deer-flow/clawd-on-desk/src/sessions.html 中加入工作区文件树侧栏/面板、顶部三按钮、双击/右键菜单、Mac 快捷键，并保留现有未提交改动。
2. Key retained decisions: 不改 main.js/preload-sessions.js；直接使用已有 workspace IPC API；文件树默认仅在展开的 workspace 中加载；时间标签压缩为 now/min/h/d。
3. Forbidden scope: 不回退既有 sessions.html 改动；不碰 main.js/preload-sessions.js；不删除其他未提交工作区改动。
4. Current status: sessions.html 已接入文件树面板、树项展开、创建/刷新、剪切/复制/粘贴、复制路径、删除、重命名、快捷键与右键菜单；语法与现有测试已通过。
5. Verification: node --check /var/folders/7z/d6kw_htj5z913075pbl9yvdr0000gn/T/sessions-inline-check.js ✅；npm test ✅（46 passed）。
6. Next step: 整理 git 状态并按需提交/推送，随后按用户要求重启应用。
