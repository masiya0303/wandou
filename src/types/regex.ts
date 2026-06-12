// ============================================================
// wandou · 正则替换条目类型
// 兼容 SillyTavern 正则扩展格式
// ============================================================

export interface RegexEntry {
  id: string
  scriptName: string          // 规则名称
  findRegex: string            // /pattern/flags 格式的 JS 正则字符串
  replaceString: string        // 替换文本（支持 $1 $2 捕获组）
  trimStrings: string[]        // 额外要去除的前后缀字符串
  placement: number[]          // 作用位置：1=发送前 2=显示前
  disabled: boolean            // true=禁用 false=启用
  markdownOnly: boolean        // 仅对 markdown 渲染后文本生效
  promptOnly: boolean          // 仅对发送给 AI 的文本生效
  runOnEdit: boolean           // 编辑时也执行
  substituteRegex: number      // 替换时是否递归
  minDepth: number | null      // 最小对话深度
  maxDepth: number | null      // 最大对话深度
}
