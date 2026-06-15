// ===== window.AGENT : all canned content (bilingual) =====
(function () {
  const t  = (zh, en) => ({ zh, en });
  const U  = (zh, en) => ({ type: "user", text: t(zh, en) });
  const T_ = (zh, en) => ({ type: "text", text: t(zh, en) });
  const TH = (sec, zh, en) => ({ type: "thinking", sec, text: t(zh, en) });
  const TL = (name, tzh, ten, cmd, ozh, oen) => ({
    type: "tool", name, title: t(tzh, ten), cmd, out: t(ozh, oen),
  });
  const RD = (file, lines) => ({ type: "read", file, lines });

  const SK = (name, tzh, ten, izh, ien, ozh, oen) => ({
    type: "skill", name, title: t(tzh, ten),
    input: t(izh, ien), output: t(ozh, oen),
  });

  // ---------- Session 1: organize downloads ----------
  const downloads = {
    id: "s1",
    title: t("整理下载文件夹的截图", "Organize Downloads screenshots"),
    icon: "folder",
    steps: [
      U("帮我把下载文件夹里乱七八糟的截图整理到一个单独的文件夹，下载目录太乱了",
        "Help me clean up the random screenshots in my Downloads folder — move them into a dedicated folder, it's a mess."),
      TH(5,
        "用户想整理 ~/Downloads 里的截图。我先列出目录看看有多少截图、命名规律是什么，再决定怎么批量移动。\n截图在 macOS 上通常以「截屏」或「Screenshot」开头，扩展名是 .png。我用 ls 看一下实际情况，避免误移其它文件。",
        "User wants to tidy up screenshots in ~/Downloads. I'll list the directory first to see how many screenshots there are and their naming pattern, then decide how to batch-move them.\nOn macOS screenshots usually start with `截屏` or `Screenshot` and end in `.png`. I'll check with `ls` to avoid moving anything else."),
      T_("我先看一下下载文件夹里都有什么，确认截图的命名规律再动手。",
         "Let me peek at the Downloads folder and confirm the naming pattern before touching anything."),
      TL("Bash", "列出下载目录内容", "List the Downloads directory",
        "ls -la ~/Downloads | head -24",
        "total 482160\n-rw-r--r--   1 lew  staff   2.1M  截屏2026-05-28 14.02.11.png\n-rw-r--r--   1 lew  staff   1.8M  截屏2026-05-28 16.41.39.png\n-rw-r--r--   1 lew  staff   2.4M  截屏2026-05-29 09.13.50.png\n-rw-r--r--   1 lew  staff   3.0M  Screenshot 2026-05-30.png\n-rw-r--r--   1 lew  staff   8.4M  invoice_april.pdf\n-rw-r--r--   1 lew  staff   1.2M  截屏2026-06-01 11.20.07.png\n…  (共 14 个截图, 3 个其它文件)",
        "total 482160\n-rw-r--r--   1 lew  staff   2.1M  截屏2026-05-28 14.02.11.png\n-rw-r--r--   1 lew  staff   1.8M  截屏2026-05-28 16.41.39.png\n-rw-r--r--   1 lew  staff   2.4M  截屏2026-05-29 09.13.50.png\n-rw-r--r--   1 lew  staff   3.0M  Screenshot 2026-05-30.png\n-rw-r--r--   1 lew  staff   8.4M  invoice_april.pdf\n-rw-r--r--   1 lew  staff   1.2M  截屏2026-06-01 11.20.07.png\n…  (14 screenshots, 3 other files)"),
      T_("找到 **14** 个截图（`截屏*.png` 和 `Screenshot*.png`），还有 3 个非截图文件会被保留。我新建一个 `Screenshots` 文件夹，再把截图移过去。",
         "Found **14** screenshots (`截屏*.png` and `Screenshot*.png`); the 3 non-screenshot files will be kept. I'll create a `Screenshots` folder and move them in."),
      SK("file_organizer",
        "分析文件命名模式", "Analyze file naming patterns",
        "~/Downloads/*.png — 14 files matching 截屏* / Screenshot*",
        "~/Downloads/*.png — 14 files matching 截屏* / Screenshot*",
        "- 截屏2026-05-28 14.02.11.png → Screenshots/2026-05/\n- 截屏2026-05-28 16.41.39.png → Screenshots/2026-05/\n- Screenshot 2026-05-30.png → Screenshots/2026-05/\n- 截屏2026-06-01 11.20.07.png → Screenshots/2026-06/\n\n共 14 个文件，建议按月份分入 2 个子文件夹。",
        "- 截屏2026-05-28 14.02.11.png → Screenshots/2026-05/\n- 截屏2026-05-28 16.41.39.png → Screenshots/2026-05/\n- Screenshot 2026-05-30.png → Screenshots/2026-05/\n- 截屏2026-06-01 11.20.07.png → Screenshots/2026-06/\n\n14 files total — suggest splitting into 2 monthly subfolders."),
      TL("Bash", "创建文件夹并移动截图", "Create folder and move screenshots",
        "mkdir -p ~/Downloads/Screenshots && \\\n  mv ~/Downloads/截屏*.png ~/Downloads/Screenshot*.png \\\n     ~/Downloads/Screenshots/",
        "(完成，无输出)",
        "(done, no output)"),
      TL("Bash", "确认移动结果", "Verify the move",
        "ls ~/Downloads/Screenshots | wc -l && ls ~/Downloads | grep -c '.png'",
        "14\n0", "14\n0"),
      T_("整理完成。14 张截图已全部移动到 `~/Downloads/Screenshots/`，下载根目录里已经没有散落的 `.png` 了。\n\n要不要我再帮你按 **日期** 把截图分到 `2026-05` / `2026-06` 子文件夹里？",
         "Done. All 14 screenshots are in `~/Downloads/Screenshots/`, and the Downloads root no longer has stray `.png` files.\n\nWant me to break them down further by **date** into `2026-05` / `2026-06` subfolders?"),
    ],
  };

  // ---------- Session 2: ESLint cache ----------
  const eslint = {
    id: "s2",
    title: t("ESLint 配置改了不生效", "ESLint config not taking effect"),
    icon: "chat",
    steps: [
      U("我改了 .eslintrc 的规则但编辑器里一直不生效，是不是缓存问题？",
        "I changed rules in .eslintrc but they aren't taking effect in the editor — is it a cache issue?"),
      TH(3,
        "典型的 ESLint 不生效问题，多半是 ESLint server 缓存或编辑器没重载。我先确认配置文件确实被保存、且语法正确，再给出重启顺序。",
        "Classic ESLint cache problem — server cache or the editor didn't reload. I'll confirm the config is saved and syntactically valid, then walk through the right restart order."),
      T_("先确认配置文件本身没问题，再处理缓存。我看一下当前的规则有没有写错。",
         "Let me confirm the config itself is valid first, then deal with the cache."),
      RD(".eslintrc.js", "1-18"),
      T_("配置语法没问题。这种「改了不生效」九成是 **缓存** 或编辑器没重载。按顺序试：\n\n1. 重启 ESLint 服务\n2. 还不行 → 重新加载窗口（`Developer: Reload Window`）\n3. 还不行 → 完全退出编辑器再打开\n4. 还不行 → 确认保存的是 `.eslintrc.js` 而不是 `eslint.config.js`",
         "Config syntax is fine. Nine times out of ten this is **cache** or the editor not reloading. Try in order:\n\n1. Restart the ESLint server\n2. Still nothing → reload the window (`Developer: Reload Window`)\n3. Still nothing → fully quit the editor and reopen\n4. Still nothing → confirm you saved `.eslintrc.js`, not `eslint.config.js`"),
      TL("Bash", "清掉 ESLint 缓存验证", "Clear the ESLint cache and re-verify",
        "rm -f .eslintcache && npx eslint . --max-warnings 0",
        "✔ 0 problems (0 errors, 0 warnings)\n规则已按新配置生效。",
        "✔ 0 problems (0 errors, 0 warnings)\nNew rules are now in effect."),
      T_("删掉 `.eslintcache` 后重新跑，新规则已经生效。以后改完配置如果不灵，先删这个缓存文件最快。",
         "After deleting `.eslintcache` and re-running, the new rules took effect. Next time a config edit doesn't apply, delete this cache file first."),
    ],
  };

  // ---------- live streaming run (when user sends a new message) ----------
  const liveRun = [
    TH(4,
      "用户想抓取这个页面的核心内容并做成要点。我先用 curl 取回 HTML，再抽正文、去掉导航和脚本，最后压缩成 5 条要点。\n页面可能有反爬，先看 HTTP 状态码，必要时带 UA。",
      "User wants the page's core content as bullets. I'll fetch the HTML with curl, extract the body, strip nav and scripts, then condense to ~5 bullets.\nPage may block bots — I'll check the status first and add a UA if needed."),
    T_("我先把页面抓回来，看看返回是否正常。",
       "Let me fetch the page first and see if the response looks right."),
    SK("web_search",
      "搜索页面元信息", "Search page metadata",
      "site:example.com/blog/agent-design",
      "site:example.com/blog/agent-design",
      "### 搜索结果\n1. **Agent Design: Building Conversational UIs** — example.com/blog/agent-design\n   - 发布于 2026-05-15，阅读量 12.4k\n   - 标签: `agent`, `ux`, `conversation-flow`\n2. **Desktop Agent Best Practices** — example.com/blog/desktop-agents\n   - 发布于 2026-04-20",
      "### Search results\n1. **Agent Design: Building Conversational UIs** — example.com/blog/agent-design\n   - Published 2026-05-15, 12.4k reads\n   - Tags: `agent`, `ux`, `conversation-flow`\n2. **Desktop Agent Best Practices** — example.com/blog/desktop-agents\n   - Published 2026-04-20"),
    TL("Bash", "抓取页面 HTML", "Fetch the page HTML",
      "curl -sL -A 'Mozilla/5.0' \\\n  'https://example.com/blog/agent-design' \\\n  -o /tmp/page.html && wc -l /tmp/page.html",
      "1842 /tmp/page.html",
      "1842 /tmp/page.html"),
    T_("拿到了 1842 行 HTML。现在抽出正文文字，去掉脚本、样式和导航。",
       "Got 1842 lines of HTML. Now I'll extract the body text and strip scripts, styles, and nav."),
    TL("Bash", "提取正文纯文本", "Extract the body as plain text",
      "python3 -c \"import sys,re,html;\\\nt=open('/tmp/page.html').read();\\\nt=re.sub(r'<(script|style)[^>]*>.*?</\\\\1>','',t,flags=re.S);\\\nt=re.sub(r'<[^>]+>',' ',t);\\\nprint(len(html.unescape(t).split()),'words')\"",
      "2316 words", "2316 words"),
    RD("/tmp/page-clean.txt", "1-60"),
    T_("正文约 2300 词，主题是「桌面 Agent 的对话流设计」。我整理成要点：",
       "About 2300 words; the topic is 'designing the conversation flow for a desktop Agent'. Here are the bullets:"),
    T_("**核心要点**\n1. 工具调用应默认展开 IN/OUT，让用户看清 Agent 真的做了什么\n2. 思考过程用低对比度灰色呈现，可折叠，不抢正文\n3. 用清晰的步骤层级把「思考 → 工具 → 结论」串起来，让流程可追溯\n4. 长输出要能滚动 + 截断，避免淹没对话\n5. 运行中提供 暂停 / 停止，把控制权交还用户\n\n需要我把这份要点导出成 Markdown 文件吗？",
       "**Key points**\n1. Tool calls should default to expanded IN/OUT so users see what the Agent actually did\n2. Render thinking in low-contrast gray, collapsible — don't compete with the main answer\n3. Use a clear step hierarchy so 'thinking → tool → conclusion' stays traceable\n4. Long outputs should scroll + truncate so they don't drown the conversation\n5. Provide pause / stop during a run so the user keeps control\n\nWant me to export these as a Markdown file?"),
  ];

  // ---------- recents (sidebar) ----------
  const recents = [
    { id: "s1", title: t("整理下载文件夹的截图", "Organize Downloads screenshots"), icon: "folder" },
    { id: "s2", title: t("ESLint 配置改了不生效", "ESLint config not taking effect"), icon: "chat" },
    { id: "s3", title: t("批量重命名照片并按月份归档", "Bulk rename and archive photos by month"), icon: "image" },
    { id: "s4", title: t("抓取竞品定价页生成对比表", "Scrape competitor pricing into a table"), icon: "globe" },
    { id: "s5", title: t("一周工作计划编写", "Draft a weekly work plan"), icon: "calendar" },
    { id: "s6", title: t("清理 pip / npm 缓存释放磁盘", "Clear pip / npm cache to free disk"), icon: "broom" },
    { id: "s7", title: t("把会议录音转成纪要", "Turn meeting audio into a recap"), icon: "mic" },
    { id: "s8", title: t("监控这个网址有货就提醒我", "Watch this URL and ping when in stock"), icon: "bell" },
  ];

  // generic placeholder thread for the other recents
  const genericThread = (titleEntry, qZh, qEn) => ({
    id: "", title: titleEntry, icon: "chat",
    steps: [
      U(qZh, qEn),
      TH(3, "理解需求，规划步骤，再逐步执行。",
            "Understand the goal, plan the steps, execute one by one."),
      T_(
        "好的，我来处理「" + titleEntry.zh + "」。先确认环境和输入，再分步执行。",
        "Got it — I'll handle '" + titleEntry.en + "'. Let me confirm environment and inputs, then proceed step by step."),
      TL("Bash", "检查环境", "Check environment",
        "echo $SHELL && pwd", "/bin/zsh\n/Users/lew", "/bin/zsh\n/Users/lew"),
      T_("环境正常。这条会话是演示用的占位线程 —— 在底部输入框发一条消息即可看到完整的实时运行流程。",
         "Environment looks fine. This conversation is a demo placeholder — send a message at the bottom to watch the full live run."),
    ],
  });

  const sessions = {
    s1: downloads,
    s2: eslint,
    s3: genericThread(recents[2].title, "帮我把这些照片按拍摄月份重命名归档", "Rename and archive these photos by capture month"),
    s4: genericThread(recents[3].title, "抓取这几个竞品的定价页，做成对比表", "Scrape these competitor pricing pages into a comparison table"),
    s5: genericThread(recents[4].title, "根据我的待办列表生成一份一周工作计划", "Turn my todo list into a weekly work plan"),
    s6: genericThread(recents[5].title, "磁盘满了，帮我清理 pip 和 npm 缓存", "Disk is full — clear my pip and npm caches"),
    s7: genericThread(recents[6].title, "把这段会议录音转成结构化纪要", "Turn this meeting audio into a structured recap"),
    s8: genericThread(recents[7].title, "监控这个商品页，有货就提醒我", "Watch this product page and ping me when it's back in stock"),
  };

  // file preview content (mock)
  window.FILE_CONTENT = {
    "/tmp/page-clean.txt": `Agent Design: Building Conversational UIs

## Introduction

Designing the conversation flow for a desktop Agent is fundamentally different from designing a chatbot. Users aren't just exchanging messages — they're delegating tasks and watching an autonomous system execute them.

---

## Key Principles

### 1. Show your work

Tool calls should default to expanded IN/OUT so users see exactly what the Agent did, not just what it said. Trust is built through transparency.

### 2. Separate thinking from answering

Render the reasoning process in low-contrast gray, collapsible. It should be available but not compete with the final answer.

### 3. Make the flow traceable

Use a clear step hierarchy so \`thinking → tool → conclusion\` can be followed sequentially. Each step should be independently collapsible.

### 4. Handle long output gracefully

Long tool outputs should scroll within a bounded container. Avoid letting a single step push important context off screen.

### 5. Give users control

Provide pause and stop during a run so the user can intervene at any point. A running Agent should never feel like a runaway process.

---

## Conversation Structure

A well-structured agent turn has three phases:

1. **Reasoning** — the Agent thinks through the problem
2. **Execution** — one or more tool calls with visible I/O
3. **Response** — a clear, concise answer that references what was found

Keeping these phases visually distinct helps users understand what happened and build accurate mental models of Agent behavior.

---

## Implementation Notes

- Use \`font-family: monospace\` for tool I/O to signal machine-readable content
- Animate step entrance with \`translateY\` only (no opacity fade) for clean captures
- Persist scroll position across reloads using \`localStorage\`
- Right-align user messages as speech bubbles; left-align Agent steps as structured blocks`,

    ".eslintrc.js": `module.exports = {
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react', '@typescript-eslint'],
  rules: {
    'no-console': 'warn',
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};`,
  };

  window.AGENT = { sessions, recents, liveRun };
})();
