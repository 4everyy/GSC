/**
 * htmlToElement —— 将 HTML 字符串转换为 DOM 元素。
 *
 * MapLibre 的 Marker 需要 HTMLElement（而非 HTML 字符串），
 * 而现有业务代码（waypointIcon / DroneSimulator）生成的是 HTML 字符串，
 * 此工具统一桥接两种调用方式。
 *
 * 实现使用 <template> 元素解析 HTML，避免直接 innerHTML 注入的全局污染。
 */
export function htmlToElement(html: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const node = template.content.firstElementChild
  if (!node || !(node instanceof HTMLElement)) {
    throw new Error('htmlToElement: 解析失败，输入 HTML 无有效根元素')
  }
  return node
}