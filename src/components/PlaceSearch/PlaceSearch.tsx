import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import './PlaceSearch.css'

/** 搜索结果项 */
interface SearchResult {
  title: string
  address?: string
  point: BMapGL.Point
}

/** PlaceSearch 组件属性 */
interface PlaceSearchProps {
  /** 百度地图实例，用于执行搜索与定位 */
  map: BMapGL.Map | null
}

/** PlaceSearch 临时标注图标（橙色定位针），与航点图标区分 */
const PLACE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  '<path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 16 12 16s12-7 12-16c0-6.6-5.4-12-12-12z" fill="#ff9800" stroke="#fff" stroke-width="2"/>' +
  '<circle cx="16" cy="14" r="5" fill="#fff"/></svg>'

/**
 * 地址搜索组件。
 *
 * 职责：
 * - 提供搜索输入框，用户输入关键词后通过 `BMapGL.LocalSearch` 检索 POI；
 * - 在下拉列表中展示搜索结果（标题 + 地址）；
 * - 选中结果后，地图移动到目标位置并添加标注。
 */
export function PlaceSearch({ map }: PlaceSearchProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  // 保留 LocalSearch 实例引用，避免重复创建
  const searchRef = useRef<BMapGL.LocalSearch | null>(null)
  // 保留本组件最近添加的标注，定位时仅移除自己的标注，避免误删航点等其它覆盖物
  const placeMarkerRef = useRef<BMapGL.Marker | null>(null)

  /** 执行关键词搜索 */
  const doSearch = useCallback(
    (text: string) => {
      if (!map || !text.trim()) {
        setResults([])
        return
      }
      // 惰性初始化 LocalSearch 实例
      if (!searchRef.current) {
        searchRef.current = new BMapGL.LocalSearch(map, {
          // 禁用内置渲染，由我们自行渲染结果列表
          renderOptions: { map, selectFirstResult: false, autoViewport: false },
          onSearchComplete: (localResult) => {
            const count = localResult.getCurrentNumPois()
            const list: SearchResult[] = []
            for (let i = 0; i < count; i++) {
              const poi = localResult.getPoi(i)
              if (poi) list.push({ title: poi.title, address: poi.address, point: poi.point })
            }
            setResults(list)
            setShowResults(list.length > 0)
            setHighlightIndex(-1)
          },
        })
      }
      searchRef.current.search(text)
    },
    [map],
  )

  /** 输入变化时触发搜索（带简单防抖） */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handleChange = (value: string) => {
    setKeyword(value)
    setShowResults(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  /** 选中某个结果：移动地图并添加标注（仅清理本组件上一次的标注） */
  const handleSelect = (poi: SearchResult) => {
    if (!map) return
    // 仅移除本组件上一次添加的标注，避免误删航点等其它覆盖物
    if (placeMarkerRef.current) {
      map.removeOverlay(placeMarkerRef.current)
      placeMarkerRef.current = null
    }
    map.panTo(poi.point)
    const icon = new BMapGL.Icon(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLACE_ICON_SVG)}`,
      new BMapGL.Size(32, 32),
      { anchor: new BMapGL.Size(16, 32) },
    )
    const marker = new BMapGL.Marker(poi.point, { icon })
    map.addOverlay(marker)
    placeMarkerRef.current = marker
    setKeyword(poi.title)
    setShowResults(false)
  }

  /** 键盘导航：上下选择，回车确认，Esc 关闭 */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = highlightIndex >= 0 ? results[highlightIndex] : results[0]
      if (target) handleSelect(target)
    } else if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  return (
    <div className="place-search">
      <div className="place-search__input-wrapper">
        <span className="place-search__icon" aria-hidden>
          🔍
        </span>
        <input
          type="text"
          className="place-search__input"
          placeholder="搜索地址或地点…"
          value={keyword}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
        />
        {keyword && (
          <button
            type="button"
            className="place-search__clear"
            onClick={() => {
              setKeyword('')
              setResults([])
              setShowResults(false)
            }}
            aria-label="清除"
          >
            ✕
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <ul className="place-search__results">
          {results.map((item, idx) => (
            <li
              key={`${item.title}-${idx}`}
              className={`place-search__result-item ${idx === highlightIndex ? 'is-active' : ''}`}
              onMouseDown={() => handleSelect(item)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <span className="place-search__result-title">{item.title}</span>
              {item.address && <span className="place-search__result-address">{item.address}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}