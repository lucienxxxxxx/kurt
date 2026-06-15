/** UI strings (ported from prototype/i18n.js) + the `tr` helper.
 *  Kept as a typed dict (not react-i18next) to match the prototype 1:1 and stay
 *  light; conversation content stays bilingual {zh,en} data, picked by `tr`. */

import type { Lang, LocalizedString } from "../types.ts";

export const T = {
  // sidebar
  newChat: { zh: "新对话", en: "New chat" },
  projects: { zh: "项目", en: "Projects" },
  skills: { zh: "技能", en: "Skills" },
  recent: { zh: "最近", en: "Recent" },
  search: { zh: "搜索", en: "Search" },
  // top bar
  convNew: { zh: "新对话", en: "New chat" },
  toggleTheme: { zh: "切换主题", en: "Toggle theme" },
  openSettings: { zh: "打开设置", en: "Open settings" },
  // step labels
  thoughtFor: { zh: "已思考 {n}s", en: "Thought for {n}s" },
  thinking: { zh: "正在思考…", en: "Thinking…" },
  expand: { zh: "展开", en: "Expand" },
  collapse: { zh: "折叠", en: "Collapse" },
  readPrefix: { zh: "Read", en: "Read" },
  linesLabel: { zh: "行 {range}", en: "lines {range}" },
  // composer
  phEmpty: { zh: "交给 Kurt 一个任务…", en: "Give Kurt a task…" },
  phRunning: { zh: "排队下一条消息…", en: "Queue another message…" },
  runningLabel: { zh: "Kurt 正在运行…", en: "Kurt is running…" },
  paused: { zh: "已暂停", en: "Paused" },
  pause: { zh: "暂停", en: "Pause" },
  resume: { zh: "继续", en: "Resume" },
  stop: { zh: "停止", en: "Stop" },
  send: { zh: "发送", en: "Send" },
  queued: { zh: "排队中", en: "Queued" },
  cancelQueued: { zh: "取消", en: "Cancel" },
  voice: { zh: "语音输入", en: "Voice input" },
  addAttach: { zh: "添加附件", en: "Add attachment" },
  chooseFolder: { zh: "选择文件夹", en: "Choose folder" },
  pasteUrl: { zh: "粘贴网址", en: "Paste a URL" },
  effortLow: { zh: "低", en: "Low" },
  effortMed: { zh: "中", en: "Medium" },
  effortHigh: { zh: "高", en: "High" },
  effortMax: { zh: "极致", en: "Max" },
  effortMaxNote: { zh: "（深度思考）", en: " (deep thinking)" },
  // empty state
  emptyTitle: { zh: "交给 Kurt 一个任务", en: "Give Kurt a task" },
  emptyDesc: {
    zh: "它会一步步思考、调用工具、并把每一步的输入输出都展示给你 —— 整理文件、抓取网页、批量处理，都可以。",
    en: "Kurt thinks step by step, calls tools, and surfaces every input and output — organize files, scrape the web, batch tasks, all in one place.",
  },
  suggest1: { zh: "整理我的下载文件夹", en: "Organize my downloads folder" },
  suggest2: { zh: "抓取这个页面做成要点", en: "Turn this page into bullet points" },
  suggest3: { zh: "把照片按月份归档", en: "Archive my photos by month" },
  // recent item menu
  archiveToProject: { zh: "归纳到项目", en: "Archive to project" },
  deleteChat: { zh: "删除", en: "Delete" },
  // settings
  close: { zh: "关闭", en: "Close" },
  settings: { zh: "设置", en: "Settings" },
  catAppearance: { zh: "外观", en: "Appearance" },
  catGeneral: { zh: "通用", en: "General" },
  catAbout: { zh: "关于", en: "About" },
  colorMode: { zh: "颜色模式", en: "Color mode" },
  colorModeDesc: { zh: "选择浅色或深色界面", en: "Choose a light or dark interface" },
  language: { zh: "语言", en: "Language" },
  languageDesc: { zh: "界面与对话内容显示的语言", en: "Language for the UI and conversation content" },
  modeLight: { zh: "浅色", en: "Light" },
  modeDark: { zh: "深色", en: "Dark" },
  chinese: { zh: "中文", en: "中文" },
  english: { zh: "English", en: "English" },
  startupRun: { zh: "开机启动", en: "Launch at login" },
  startupRunDesc: { zh: "登录后自动启动 Kurt", en: "Start Kurt automatically when you sign in" },
  sendOnEnter: { zh: "回车直接发送", en: "Send with Enter" },
  sendOnEnterDesc: { zh: "关闭后需要 Cmd+Enter 才发送", en: "When off, requires Cmd+Enter to send" },
  aboutVersion: { zh: "版本", en: "Version" },
  aboutTagline: { zh: "桌面端 Agent 助手", en: "Your desktop Agent companion" },
} satisfies Record<string, LocalizedString>;

export type StringKey = keyof typeof T;

/** Pick a string from a {zh,en} entry (or pass-through), interpolating {param}s. */
export function tr(
  entry: LocalizedString | string | null | undefined,
  lang: Lang,
  params?: Record<string, string | number>,
): string {
  if (entry == null) return "";
  let v = typeof entry === "string" ? entry : entry[lang] || entry.zh || entry.en || "";
  if (params) for (const k in params) v = v.split("{" + k + "}").join(String(params[k]));
  return v;
}
