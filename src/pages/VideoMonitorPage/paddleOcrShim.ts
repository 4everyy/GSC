/**
 * @file paddleOcrShim.ts
 * @description @paddle-js-models/ocr 内嵌 OpenCV.js 的 UMD 包装在 ESM（严格模式）下执行
 *              `if (typeof Module === "undefined") Module = {}`——对未声明标识符赋值会抛
 *              "ReferenceError: Module is not defined"（dev 预打包与生产构建产物均为
 *              严格模式）。预置 window.Module 占位后 typeof 判定为已定义、跳过赋值。
 *              须先于 @paddle-js-models/ocr 求值（见 ocrBlueMark.ts 的 import 顺序）。
 * @author 4everyy
 * @date 2026-10-12
 */
declare global {
  interface Window {
    Module?: Record<string, unknown>
  }
}

window.Module = window.Module ?? {}

export {}
