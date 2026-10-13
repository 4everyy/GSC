/**
 * @file blueMarkDetect.ts
 * @description 视频画面内「蓝色 ID 标记」检测（纯前端 Canvas 像素分析，零依赖）。
 *              demo2.mp4 等样例视频的画面里烧录了蓝色 ID 字样（属于视频像素的一部分）。
 *              本模块按「标记蓝」颜色特征（蓝分量显著高于红/绿且红绿接近，可排除天空、
 *              水面等自然蓝）对当前帧降采样扫描，经 8 邻域连通域标记 + 同行字形横向
 *              合并，输出每个蓝色标记的紧致外接框（视频原始像素坐标），
 *              供点击截图吸附与画面描框标注使用。
 * @author 4everyy
 * @date 2026-10-11
 */

/** 蓝色标记外接框（视频原始像素坐标） */
export interface BlueMark {
  x: number
  y: number
  w: number
  h: number
}

/** 扫描用中间框（缩放画布像素坐标，n 为像素数） */
interface ScanBox {
  x: number
  y: number
  w: number
  h: number
  n: number
}

/** 「标记蓝」判定：界面标注用的深蓝（r≈g、b 显著更高）；
 *  天空 (100,150,230) 因 |r-g| 过大、深蓝水面 (20,60,160) 因 r-g≈40 均被排除 */
const isMarkBlue = (r: number, g: number, b: number): boolean =>
  b > 150 && b > r + 60 && b > g + 50 && Math.abs(r - g) < 30

/** 同一行内水平间距较小的连通域合并（同一条 ID 字样的多个字形/笔画连成一个标记框） */
function mergeRowBoxes(boxes: ScanBox[]): ScanBox[] {
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < boxes.length && !merged; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        /* 垂直方向重叠过半 + 水平间距在字距范围内 → 视为同一字样 */
        const vOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        const minH = Math.min(a.h, b.h)
        const gap = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
        if (minH > 0 && vOverlap >= minH * 0.5 && gap <= Math.max(6, minH * 1.5)) {
          const x = Math.min(a.x, b.x)
          const y = Math.min(a.y, b.y)
          boxes[i] = {
            x,
            y,
            w: Math.max(a.x + a.w, b.x + b.w) - x,
            h: Math.max(a.y + a.h, b.y + b.h) - y,
            n: a.n + b.n,
          }
          boxes.splice(j, 1)
          merged = true
          break
        }
      }
    }
  }
  return boxes
}

/**
 * 检测视频当前帧内的蓝色 ID 标记。
 * @param video 目标视频元素（readyState ≥ 2 且有尺寸时才有效）
 * @param maxSide 扫描画布最长边（降采样加速；检测结果已换算回原始像素坐标）
 * @returns 标记外接框数组（原始像素坐标，按从左到右排序）；无标记/未就绪返回空数组
 */
export function detectBlueMarks(video: HTMLVideoElement, maxSide = 960): BlueMark[] {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (video.readyState < 2 || !vw || !vh) return []
  const s = Math.min(1, maxSide / Math.max(vw, vh))
  const w = Math.max(1, Math.round(vw * s))
  const h = Math.max(1, Math.round(vh * s))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(video, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data

  /* 1) 逐像素做标记蓝二值化 */
  const total = w * h
  const mask = new Uint8Array(total)
  for (let p = 0; p < total; p++) {
    const i = p * 4
    if (isMarkBlue(d[i], d[i + 1], d[i + 2])) mask[p] = 1
  }

  /* 2) 8 邻域连通域标记（迭代栈，避免递归深度问题） */
  const visited = new Uint8Array(total)
  const stack = new Int32Array(total)
  const comps: ScanBox[] = []
  for (let p0 = 0; p0 < total; p0++) {
    if (!mask[p0] || visited[p0]) continue
    let sp = 0
    stack[sp++] = p0
    visited[p0] = 1
    let minX = w
    let minY = h
    let maxX = 0
    let maxY = 0
    let n = 0
    while (sp > 0) {
      const p = stack[--sp]
      const px = p % w
      const py = (p / w) | 0
      n++
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      const x0 = px > 0 ? px - 1 : 0
      const x1 = px < w - 1 ? px + 1 : w - 1
      const y0 = py > 0 ? py - 1 : 0
      const y1 = py < h - 1 ? py + 1 : h - 1
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const np = ny * w + nx
          if (mask[np] && !visited[np]) {
            visited[np] = 1
            stack[sp++] = np
          }
        }
      }
    }
    comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, n })
  }

  /* 3) 过滤噪声碎块 + 字形横向合并成完整标记框。
     阈值按扫描分辨率取：单字形连通域允许小到 4px（合并后整条字样再按总像素过滤） */
  const minPx = 4
  const boxes = comps.filter((c) => c.n >= minPx && c.w >= 2 && c.h >= 2)
  const mergedBoxes = mergeRowBoxes(boxes).filter((b) => b.w >= 3 && b.h >= 3 && b.n >= 10)

  /* 4) 换算回视频原始像素坐标（扫描画布按 1/s 缩小过），从左到右排序 */
  return mergedBoxes
    .map((b) => ({ x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
}
