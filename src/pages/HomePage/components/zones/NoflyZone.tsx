/**
 * NoflyZone —— 红色禁飞区静态区块（自 HomePage.tsx 拆出）。
 *
 * 左下角倾斜四边形，SVG 绘制边框 + 四角节点；显隐由父级根据图层控制面板
 * 「禁飞区」开关联动（layerStore），本组件只负责展示。
 */
export function NoflyZone() {
  return (
    <div className="restricted-zone restricted-zone--red" aria-label="禁飞区域">
      <svg
        className="restricted-zone__border"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon
          points="22,0 78,8 100,100 0,92"
          fill="rgba(220,38,38,0.35)"
          stroke="rgba(172,14,14,0.85)"
          strokeWidth="0.8"
        />
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="8">
            <line
              x1="3"
              y1="0"
              x2="3"
              y2="8"
              stroke="rgba(220,38,38,0.35)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <polygon points="22,0 78,8 100,100 0,92" fill="url(#hatch)" />
      </svg>
      {/* Hover 信息面板 */}
      <div className="block_7 flex-col" data-hover-panel>
        <div className="block_7__top">
          <span className="text_8">01禁飞区</span>
          <div className="section_3 flex-col"></div>
        </div>
        <div className="block_7__bottom">
          <div className="section_4 flex-row">
            <div className="box_13 flex-col"></div>
            <span className="text_9">来源</span>
            <span className="text_10">管理员划定</span>
          </div>
          <div className="section_5 flex-row">
            <div className="group_10 flex-col"></div>
            <span className="text_11">面积</span>
            <span className="text_12">156m&nbsp;x&nbsp;314m</span>
          </div>
          <div className="section_6 flex-row">
            <div className="group_11 flex-col"></div>
            <span className="text_13">模式</span>
            <span className="text_14">悬停</span>
          </div>
        </div>
      </div>
      {/* 四角正方形节点标记 */}
      <span className="corner-marker corner-marker--tl" /> {/* 左上 (22%, 0%) */}
      <span className="corner-marker corner-marker--tr" /> {/* 右上 (78%, 8%) */}
      <span className="corner-marker corner-marker--br" /> {/* 右下 (100%, 100%) */}
      <span className="corner-marker corner-marker--bl" /> {/* 左下 (0%, 92%) */}
    </div>
  )
}