# 监控画面蓝色 ID 识别方案（PaddleOCR.js + 蓝色定位预处理）

> 适用场景：从监控/抓拍截图中识别画面内的蓝色 `id:xxxx` 编号标识（如 `id:1850`、`id:1963`）。
> 方案性质：**纯前端、免费、无调用次数限制、离线运行**。

---

## 1. 方案概述

| 项目 | 说明 |
| --- | --- |
| 目标 | 识别监控截图中的蓝色 `id:1850` 类编号 |
| 核心引擎 | PaddleOCR.js（飞桨官方浏览器 SDK，WASM 推理） |
| 关键优化 | 蓝色像素定位 → 裁剪 → 放大 → 再识别 |
| 费用 | 免费（无按次计费、无注册、无额度上限） |
| 运行环境 | 浏览器（Chrome/Edge/Firefox 等），模型加载支持 WebGL / WebGPU / WASM 后端 |
| 隐私 | 图片全程在本机处理，数据不出本地 |

---

## 2. 为什么这是"免费且最好"的方案

1. **完全免费、无限量**：纯前端运行，不按调用次数计费，适合持续、大批量的监控识别。
2. **准确率领先**：PaddleOCR 系在中文/印刷体场景识别质量位居免费方案前列（第三方印刷文本评测中字符错误率约 1.5%–2.2%，明显优于 Tesseract.js 的 3.2%–5.1%）。
3. **"蓝色定位"是准确率与速度的关键**：id 字样在画面中颜色独特，先用颜色过滤圈出蓝色区域，裁剪放大后再识别——把"在整张监控图上找小字"变成"识别一张放大的局部图"，识别率与速度都远超直接整图识别。
4. **隐私安全**：监控数据敏感，本方案图片不离开浏览器，无上传风险。
5. **唯一的"一次性成本"**：首次运行需联网下载模型（约数 MB），之后可自托管 CDN 或本地缓存，识别过程完全离线。

---

## 3. 处理管线

```
监控截图 ──▶ ① 蓝色掩码定位 ──▶ ② 裁剪蓝色区域 ──▶ ③ 放大 4× ──▶ ④ PaddleOCR.js 离线识别 ──▶ ⑤ 正则提取编号
```

| 步骤 | 作用 | 收益 |
| --- | --- | --- |
| ① 蓝色掩码定位 | 像素级判定蓝色（b 通道显著高于 r/g），圈出 id 文字区域 | 排除画面中所有其他内容，只保留目标 |
| ② 裁剪 | 按蓝色包围盒截取局部图 | 大幅缩小 OCR 输入范围 |
| ③ 放大 4× | 双线性插值放大，增强小字细节 | 显著提升小字号识别率 |
| ④ PaddleOCR.js 识别 | WASM 离线推理，输出文本与坐标 | 免费、无限量、无网络依赖 |
| ⑤ 正则提取 | 匹配 `id:xxxx` 模式 | 稳定输出纯编号，过滤杂讯 |

---

## 4. 完整代码

```js
import * as ocr from '@paddle-js-models/ocr'; // npm i @paddle-js-models/ocr

// 1) 图片文件 → Canvas
function loadToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 2) 蓝色像素包围盒（监控蓝标：b 显著高于 r/g，阈值可按截图微调）
function blueBounds(canvas) {
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const isBlue = b > 100 && b - r > 30 && b - g > 10; // 蓝色系判定
      if (isBlue) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

// 3) 裁剪蓝色区域并放大 4 倍
function cropUpscale(src, box, scale = 4) {
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  const out = document.createElement('canvas');
  out.width = w * scale; out.height = h * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, box.minX, box.minY, w, h, 0, 0, w * scale, h * scale);
  return out;
}

// 4) 主流程：截图文件 → id 编号
async function extractId(file) {
  const src = await loadToCanvas(file);
  const box = blueBounds(src);
  if (!box) return null; // 画面中没有蓝色区域

  const cropped = cropUpscale(src, box);
  const blob = await new Promise(r => cropped.toBlob(r, 'image/png'));

  await ocr.init(); // 首次加载模型；建议在页面初始化时全局调用一次，之后复用
  const res = await ocr.recognize(blob);

  const m = String(res.text).match(/id\s*[:：]?\s*(\d+)/i);
  return m ? m[1] : res.text.trim();
}

// 用法：
// const id = await extractId(fileInput.files[0]); // → "1850"
```

---

## 5. 关键参数与调优

### 5.1 蓝色判定阈值

默认判定条件（满足即为蓝色像素）：

```js
b > 100 && b - r > 30 && b - g > 10
```

- 个别截图识别不出时，放宽为：

```js
b > 90 && b - r > 25 && b - g > 8
```

- 蓝标样式差异大（蓝底白字 vs 纯蓝文字）时，优先用宽松阈值，再配合 5.3 处理。

### 5.2 放大倍数

- 默认 `scale = 4`。小字或模糊图可提高到 `6`；文字清晰时 `2`~`3` 更快。

### 5.3 蓝底白字标牌

若蓝色区域较大且文字为白色，可在蓝色包围盒内**反向提取白色像素**作为掩码再识别：

```js
const isText = r > 180 && g > 180 && b > 180; // 蓝区内的白色文字
```

### 5.4 编号正则

```js
/id\s*[:：]?\s*(\d+)/i   // 兼容 "id:1850" / "ID:1850" / "id：1850"
```

---

## 6. 适用场景与使用建议

| 场景 | 做法 |
| --- | --- |
| 持续/大批量监控识别（每日数十次以上） | 直接使用本方案，免费无上限 |
| 监控数据不便出本地 | 本方案全程离线，天然满足 |
| 单日海量识别（如视频流逐帧） | 本方案 + Web Worker 并行；必要时转后端自部署 PaddleOCR 提升吞吐 |

---

## 7. 注意事项

1. **首次加载需联网**：`ocr.init()` 会从 CDN 下载模型，建议页面初始化时预加载一次，后续复用；生产环境可将模型文件自托管到自己的 CDN/静态目录。
2. **模型体积**：整体约数 MB 级，首屏加载需做 Loading 提示。
3. **图片质量**：监控压缩/模糊会降低识别率，优先保证原始分辨率；必要时先做灰度化 + 对比度增强。
4. **倾斜文字**：轻微倾斜 PaddleOCR 可自动处理；严重倾斜可先用 Canvas `rotate` 校正或多角度尝试。
5. **误检防护**：画面中若存在其他蓝色物体（蓝色框选、蓝色按钮等），`blueBounds` 会圈到最大蓝色区域——若目标固定，可加"区域粗筛"（例如只取画面固定象限），或把放大后的识别结果用正则严格校验 `id:\d+`。

---

## 8. 参考来源

- PaddleOCR.js / 飞桨 PaddleJS（官方前端 OCR 方案）：https://www.paddlepaddle.org.cn/paddlejs
- PaddleOCR 文档（模型迭代 PP-OCRv5/v6，精度持续提升）：http://www.paddleocr.ai/main/index.html
- Tesseract.js 官网（100+ 语言纯 JS OCR）：https://tesseract.projectnaptha.com/
- 第三方评测（PaddleOCR CER 1.5–2.2% vs Tesseract.js 3.2–5.1%）：https://ai-manual.ru/article/ocr-v-brauzere-sravnivaem-trocr-paddleocr-i-drugie-modeli-na-transformersjs/
