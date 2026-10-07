/**
 * @file index.ts
 * @description hooks/index.ts（原 567 行，已按职责拆为 4 个 hook 文件）—— 此文件保留为兼容 re-export。
 * @author 4everyy
 * @date 2026-10-07
 */
export { useMapEngine, usePlaneStatusInit, useTaskAreaInit } from './useMapEngine'
export { useMapAnchorSync } from './useMapAnchorSync'
export { useDraggable, type DragPosition } from './useDraggable'
export { usePanelClamp, type UsePanelClampOptions } from './usePanelClamp'
