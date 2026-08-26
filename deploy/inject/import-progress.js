/**
 * GSC - 离线地图导入全局进度浮层（nginx 注入脚本）。
 * 拦截 IDBObjectStore.put/add：瓦片记录计数显示进行中浮层，包元数据写入即完成。
 */
;(function () {
  'use strict'

  var written = 0
  var state = 0
  var pendingUpdate = 0
  var hideTimer = 0

  var overlay = null
  var textEl = null

  function isTileRecord(v) {
    return v != null && typeof v === 'object' && 'pkgId' in v && 'z' in v && 'x' in v && 'y' in v
  }

  function isPackageMeta(v) {
    return v != null && typeof v === 'object' && 'tileCount' in v && 'importedAt' in v && 'id' in v
  }

  function fmt(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(n)
  }

  function ensureOverlay() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.id = 'gsc-import-overlay'
    var bar = document.createElement('div')
    bar.id = 'gsc-import-overlay__bar'
    var fill = document.createElement('div')
    fill.id = 'gsc-import-overlay__fill'
    bar.appendChild(fill)
    textEl = document.createElement('span')
    textEl.id = 'gsc-import-overlay__text'
    overlay.appendChild(bar)
    overlay.appendChild(textEl)
    document.body.appendChild(overlay)
  }

  function scheduleUpdate() {
    if (pendingUpdate) return
    pendingUpdate = setTimeout(function () {
      pendingUpdate = 0
      if (!textEl) return
      if (state === 1) {
        textEl.textContent = '正在导入离线地图 · 已写入 ' + fmt(written) + ' 块瓦片'
      }
    }, 150)
  }

  function showBusy() {
    ensureOverlay()
    state = 1
    overlay.className = 'is-busy'
    overlay.style.display = 'flex'
    scheduleUpdate()
  }

  function showDone() {
    ensureOverlay()
    state = 2
    overlay.className = 'is-done'
    overlay.style.display = 'flex'
    if (textEl) {
      textEl.textContent = '导入完成 · 共 ' + fmt(written) + ' 块瓦片'
    }
    clearTimeout(hideTimer)
    hideTimer = setTimeout(function () {
      state = 0
      written = 0
      if (overlay) overlay.style.display = 'none'
    }, 2500)
  }

  function patchStoreProto(method) {
    var original = IDBObjectStore.prototype[method]
    if (typeof original !== 'function') return
    IDBObjectStore.prototype[method] = function (value) {
      try {
        if (isTileRecord(value)) {
          if (state === 0) showBusy()
          if (state === 1) {
            written++
            scheduleUpdate()
          }
        } else if (isPackageMeta(value) && state === 1) {
          showDone()
        }
      } catch (_) {}
      return original.apply(this, arguments)
    }
  }

  patchStoreProto('put')
  patchStoreProto('add')
})()