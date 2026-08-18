/**
 * AircraftListSection 鈥斺€?銆岄鏈哄垪琛ㄣ€嶅尯鍧楋紙浠?AircraftListPanel 鎶藉彇鐨勫叕鍏卞瓙缁勪欢锛夈€?
 *
 * 鍖呭惈鍖哄潡澶达紙娓愬彉搴?+ 涓嬬紭闈掕壊娓愰殣绾匡級+ 鍙粴鍔ㄥ垪琛ㄨ锛堝悕绉?楂樺害/鐢甸噺/淇″彿锛夈€?
 * 渚?AircraftListPanel锛堥檷钀界瓑绾垪琛ㄩ潰鏉匡級涓?
 * ReturnHomePanel锛堣繑鑸潰鏉跨殑椋炴満鍒楄〃 tab锛夊叡鐢ㄣ€?
 */
import { deviceImages } from '../../assets/images/device'
import { homeImages } from '../../assets/images/home'
import './AircraftListPanel.css'

export interface AircraftListItem {
  /** 鍞竴鏍囪瘑 */
  id: string
  /** 鏄剧ず鍚嶇О锛屽銆?1涓鏅堕攼銆?*/
  name: string
  /** 褰撳墠楂樺害锛堢背锛?*/
  altitude: number
  /** 鐢甸噺鐧惧垎姣旓紙0~100锛?*/
  battery: number
}

export interface AircraftListSectionProps {
  /** 鍖哄潡鏍囬锛岄粯璁ゃ€岄鏈哄垪琛ㄣ€?*/
  sectionTitle?: string
  /** 椋炴満鍒楄〃锛岀己鐪佷娇鐢ㄨ璁＄绀轰緥鏁版嵁 */
  aircraft?: AircraftListItem[]
}

/** 璁捐绋跨ず渚嬫暟鎹紙group_6/7/8锛?*/
export const DEFAULT_AIRCRAFT: AircraftListItem[] = [
  { id: '01', name: '01涓鏅堕攼', altitude: 40, battery: 100 },
  { id: '02', name: '02涓鏅堕攼', altitude: 40, battery: 100 },
  { id: '03', name: '03涓鏅堕攼', altitude: 40, battery: 100 },
]

export function AircraftListSection({
  sectionTitle = '椋炴満鍒楄〃',
  aircraft = DEFAULT_AIRCRAFT,
}: AircraftListSectionProps) {
  return (
    <>
      {/* 鍖哄潡澶淬€岄鏈哄垪琛ㄣ€嶏紙group_3/group_4锛夛細娓愬彉搴?+ 涓嬬紭闈掕壊娓愰殣绾?*/}
      <div className="aircraft-list-panel__section">
        <span className="aircraft-list-panel__section-title">{sectionTitle}</span>
        <div className="aircraft-list-panel__section-divider" />
      </div>

      {/* 鍒楄〃鍖猴紙group_5锛夛細244px 闈欐€佽锛岃澶氭椂鍙粴鍔?*/}
      <div className="aircraft-list-panel__list">
        <div className="aircraft-list-panel__scrollwrap">
          <div className="aircraft-list-panel__rows">
            {aircraft.map((item) => {
              // 鐢甸噺濉厖瀹藉害鎸夌櫨鍒嗘瘮鎶樼畻锛堢數姹犲唴妗嗘渶澶?9px 瀹斤級
              const batteryFill = Math.max(2, Math.round((item.battery / 100) * 9))
              return (
                <div className="aircraft-list-panel__row" key={item.id}>
                  <span className="aircraft-list-panel__name">{item.name}</span>

                  {/* 楂樺害锛氣啈 鍒囧浘锛?4脳14锛? 鏁板€?*/}
                  <span className="aircraft-list-panel__metric">
                    <img
                      className="aircraft-list-panel__metric-icon"
                      src={deviceImages.altitudeIcon}
                      alt=""
                      draggable={false}
                    />
                    <span className="aircraft-list-panel__metric-value">
                      {item.altitude}m
                    </span>
                  </span>

                  {/* 鐢甸噺锛氱數姹犲浘鏍囷紙18脳18锛? 鐧惧垎姣?*/}
                  <span className="aircraft-list-panel__metric">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="0.5" y="5.5" width="13" height="7" rx="1" stroke="#fff" />
                      <rect x="14.5" y="7.5" width="2.5" height="3" rx="0.5" fill="#fff" />
                      <rect x="2.5" y="7.5" width={batteryFill} height="3" rx="0.5" fill="#fff" />
                    </svg>
                    <span className="aircraft-list-panel__metric-value">{item.battery}%</span>
                  </span>

                  {/* 淇″彿锛氬垏鍥撅紙18脳18锛宼humbnail_3/6/9锛?*/}
                  <img
                    className="aircraft-list-panel__signal aircraft-list-panel__signal-img"
                    src={homeImages.signalAircraft}
                    alt=""
                    draggable={false}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
