/** 界面展示：不露出 Cursor 品牌词（后端/日志原文不改） */
export function maskVendorUiText(s) {
  if (s == null || s === "") return s;
  var t = String(s);
  t = t.replace(/Cursor\s*写码\s*插件/gi, "写码插件");
  t = t.replace(/Cursor\s*插件/gi, "写码插件");
  t = t.replace(/Cursor\s*写码/gi, "写码");
  t = t.replace(/Cursor\s*SDK/gi, "写码 SDK");
  t = t.replace(/Cursor\s*API\s*Key/gi, "写码 API Key");
  t = t.replace(/本机\s*Cursor/gi, "本机写码");
  t = t.replace(/调用\s*Cursor/gi, "调用写码");
  t = t.replace(/启动\s*Cursor/gi, "启动写码");
  t = t.replace(/并用\s*Cursor/gi, "并用写码");
  t = t.replace(/Cursor/gi, "写码");
  return t;
}
