/**
 * @file ocrBlueMark.ts
 * @description 蓝色 ID 标记文字识别（纯前端 PaddleOCR.js，浏览器端推理）。
 *              方案与处理管线见 docs/监控蓝色ID识别方案-PaddleOCRjs.md：
 *              蓝色掩码定位（严格→宽松两档）→ 裁剪蓝色包围盒 → 4× 放大 →
 *              PaddleOCR.js 识别 → 正则提取 id 编号。
 *              PP-OCRv3 det/rec 模型自托管于 public/paddle-ocr/（同源加载，完全离线，
 *              不请求任何外部 CDN）；模型经 ocr.init() 加载后进程内复用，
 *              可通过 preloadBlueMarkOcr 在页面初始化时预热。
 * @author 4everyy
 * @date 2026-10-12
 */
/* ESM 按声明顺序求值：此 shim 必须先于 @paddle-js-models/ocr，
   预置 window.Module 修复其内嵌 OpenCV 在严格模式下的赋值崩溃（详见 paddleOcrShim.ts） */
import './paddleOcrShim'
import * as ocr from '@paddle-js-models/ocr'

/** 自托管模型路径（public/paddle-ocr/，Vite 原样伺服；BASE_URL 兼容非根部署）
 *  rec-finetune/ = PP-OCRv3 rec 蓝标样本微调版（tools/train/ 流水线产物）；
 *  识别变差时改回 /paddle-ocr/rec/ 即可回退官方模型 */
const DET_MODEL_URL = `${import.meta.env.BASE_URL}paddle-ocr/det/model.json`
const REC_MODEL_URL = `${import.meta.env.BASE_URL}paddle-ocr/rec-finetune/model.json`

/** 蓝色像素判定（严格档）：b 显著高于 r/g，压掉天空、水面等自然蓝（方案 5.1） */
const isBlueStrict = (r: number, g: number, b: number): boolean =>
  b > 100 && b - r > 30 && b - g > 10

/** 蓝色像素判定（宽松档）：严格档圈不到区域时兜底（方案 5.1） */
const isBlueRelaxed = (r: number, g: number, b: number): boolean =>
  b > 90 && b - r > 25 && b - g > 8

/** 蓝色像素包围盒（截图局部坐标），无蓝色像素返回 null */
interface BlueBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 蓝色掩码定位：整图扫描命中像素的最小/最大 x/y（方案管线第①②步） */
function blueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  isBlue: (r: number, g: number, b: number) => boolean,
): BlueBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (isBlue(data[i], data[i + 1], data[i + 2])) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

/** 裁剪蓝色包围盒并双线性放大 scale 倍，增强小字细节（方案管线第③步） */
function cropUpscale(src: HTMLCanvasElement, box: BlueBounds, scale: number): HTMLCanvasElement {
  const w = box.maxX - box.minX + 1
  const h = box.maxY - box.minY + 1
  const out = document.createElement('canvas')
  out.width = w * scale
  out.height = h * scale
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, box.minX, box.minY, w, h, 0, 0, out.width, out.height)
  }
  return out
}

/** canvas → HTMLImageElement（ocr.recognize 入参要求 img 元素） */
function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('预处理图像加载失败'))
    img.src = canvas.toDataURL('image/png')
  })
}

/** 共享识别引擎：ocr.init() 从本地模型初始化，之后进程内复用避免重复加载 */
let ocrReady: Promise<void> | null = null

/** 预热 PaddleOCR 模型（建议页面初始化时调用一次，命中蓝标识别时即可直接推理） */
export function preloadBlueMarkOcr(): Promise<void> {
  if (!ocrReady) {
    ocrReady = ocr.init(DET_MODEL_URL, REC_MODEL_URL).catch((err) => {
      ocrReady = null
      throw err
    })
  }
  return ocrReady
}

/**
 * 读取一张标记截图内的蓝色 ID 文字。
 * @param cropCanvas 点击瞬间的截图画布（视频原始像素，未放大）——必须是截图下载所用的
 *                   同一份像素：demo 视频循环播放，场景随时变化，OCR 不能事后重取帧
 * @returns id 编号（如 "1850"）；未识别出蓝色区域/文字时返回空字符串
 */
export async function readBlueMarkText(cropCanvas: HTMLCanvasElement): Promise<string> {
  if (!cropCanvas.width || !cropCanvas.height) return ''
  const ctx = cropCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return ''
  const { data, width, height } = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)

  /* 1) 蓝色掩码定位：严格档圈不到时放宽一档 */
  const box =
    blueBounds(data, width, height, isBlueStrict) ?? blueBounds(data, width, height, isBlueRelaxed)
  if (!box) return ''

  /* 2) 裁剪蓝色包围盒并 4× 放大 */
  const upscaled = cropUpscale(cropCanvas, box, 4)
  const img = await canvasToImage(upscaled)

  /* 3) PaddleOCR.js 识别（text 为逐行文本数组）。
     det 输入默认 960×960，蓝标截图裁剪后 480 足够，算力省 4 倍、主线程阻塞更短；
     DetPostConfig 必填检测阈值，取 PaddleOCR 官方默认值（thresh 0.3 / box_thresh 0.6 / unclip_ratio 1.5） */
  await preloadBlueMarkOcr()
  const res = await ocr.recognize(img, undefined, {
    shape: 480,
    thresh: 0.3,
    box_thresh: 0.6,
    unclip_ratio: 1.5,
  })
  const rawLines = Array.isArray(res?.text) ? res.text : [String(res?.text ?? '')]

  /* 4) 仅保留可打印 ASCII：ch 版模型可能给出中文猜测，整段剔除（目标只有英文/数字/-_.:）；
     之后正则提取编号 id:1850 / ID:1850 / id 1850（方案 5.4），未命中回退清洗后的整串 */
  const raw = rawLines.join(' ').replace(/[^\x20-\x7E]/g, ' ')
  if (!raw.trim()) return ''
  const m = raw.match(/id\s*:?\s*(\d+)/i)
  const text = m ? m[1] : raw.replace(/[^0-9A-Za-z\-_.]/g, '')
  console.debug(`[蓝标ID识别] PaddleOCR 原文："${rawLines.join(' ')}" → ASCII 过滤后："${raw.trim()}" → 提取结果："${text}"`)
  return text
}
