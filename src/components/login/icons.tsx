/*
 * icons.tsx —— 登录页内联 SVG 图标集。
 * 自 LoginPage.tsx 按功能拆分：逻辑未改动，仅移动位置。
 */

export function IconDrone({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="4.6" />
      <path d="M21 21 14.5 14.5 M27 21 33.5 14.5 M21 27 14.5 33.5 M27 27 33.5 33.5" />
      <circle cx="11" cy="11" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="37" cy="11" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="11" cy="37" r="5.2" strokeWidth="1.8" opacity="0.85" />
      <circle cx="37" cy="37" r="5.2" strokeWidth="1.8" opacity="0.85" />
    </svg>
  )
}

export function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.6-3.4 4.2-5 7.5-5s5.9 1.6 7.5 5" />
    </svg>
  )
}

export function IconLock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.4 17.4 0 0 1-3.2 3.9M6.1 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.3-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

/* ---------- 背景六边形装饰（线框，CSS 动画漂浮旋转） ---------- */

export function HexDecor({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" />
    </svg>
  )
}

/* ---------- 无人集群装饰动画（无人机 / 机械狗，CSS 动画驱动，见 LoginDrones.css） ---------- */

/**
 * 四旋翼无人机线框：机身 + 云台相机 + 四臂 + 四组桨叶（`.login-drone__prop` 旋转）。
 * 对角桨反向旋转（--ccw），模拟真实四旋翼扭矩平衡。
 */
export function DroneUnit() {
  return (
    <svg
      viewBox="0 0 96 76"
      width="100%"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 机体：中心舱 + 上盖线 */}
      <rect x="36" y="30" width="24" height="14" rx="3" strokeWidth="2.2" />
      <path d="M40 30 h16" strokeWidth="1" opacity="0.7" />
      {/* 云台相机：下挂双轴 */}
      <circle cx="48" cy="50" r="3.4" strokeWidth="1.8" />
      <path d="M44 46.5 h8 M48 44 v3" strokeWidth="1.4" opacity="0.8" />
      {/* 四臂 */}
      <path d="M38 34 22 22 M58 34 74 22 M38 40 22 52 M58 40 74 52" strokeWidth="2.4" />
      {/* 电机座 */}
      <circle cx="20" cy="20" r="3" strokeWidth="1.8" />
      <circle cx="76" cy="20" r="3" strokeWidth="1.8" />
      <circle cx="20" cy="54" r="3" strokeWidth="1.8" />
      <circle cx="76" cy="54" r="3" strokeWidth="1.8" />
      {/* 桨叶：双叶线框，CSS 旋转 */}
      <g className="login-drone__prop">
        <path d="M12 20 h16 M20 14 v12" strokeWidth="1.6" opacity="0.9" />
      </g>
      <g className="login-drone__prop login-drone__prop--ccw">
        <path d="M68 20 h16 M76 14 v12" strokeWidth="1.6" opacity="0.9" />
      </g>
      <g className="login-drone__prop login-drone__prop--ccw">
        <path d="M12 54 h16 M20 48 v12" strokeWidth="1.6" opacity="0.9" />
      </g>
      <g className="login-drone__prop">
        <path d="M68 54 h16 M76 48 v12" strokeWidth="1.6" opacity="0.9" />
      </g>
      {/* 机身状态灯 */}
      <circle cx="39" cy="37" r="1" fill="currentColor" stroke="none" />
      <circle cx="57" cy="37" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * 机械狗线框（Spot / Go2 风格，面朝右）：
 * - 一体化流线躯干：背部中段隆起（电池舱）+ 传感器圆顶 + 面板缝线；
 * - 圆角头部与前胸连贯，带面罩传感器线 + 相机点 + 头顶天线；
 * - 尾巴为上翘弧线（尾尖配 CSS 信号灯 .login-robo__beacon）；
 * - 四条两段式关节腿：大腿 -> 膝关节圆 -> 小腿 + 足垫，
 *   远侧腿低透明度垫后、近侧腿盖前，形成立体层次；
 *   对角步态（trot）：--fl/--br 同相，--fr/--bl 反相（见 LoginDrones.css）。
 */
export function RoboDogUnit() {
  return (
    <svg
      viewBox="0 0 130 92"
      width="100%"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 远侧腿（先画、低透明度，被躯干遮住髋部） */}
      <g className="login-robo__leg login-robo__leg--fl" opacity="0.5">
        <path d="M74 46 L75.5 62" strokeWidth="3" />
        <circle cx="75.5" cy="62" r="2.1" strokeWidth="1.5" />
        <g className="login-robo__shank">
          <path d="M75.5 62 L72.5 81" strokeWidth="1.9" />
          <path d="M69.5 81.5 h6" strokeWidth="1.9" />
        </g>
      </g>
      <g className="login-robo__leg login-robo__leg--bl" opacity="0.5">
        <path d="M36 46 L37.5 62" strokeWidth="3" />
        <circle cx="37.5" cy="62" r="2.1" strokeWidth="1.5" />
        <g className="login-robo__shank">
          <path d="M37.5 62 L34.5 81" strokeWidth="1.9" />
          <path d="M31.5 81.5 h6" strokeWidth="1.9" />
        </g>
      </g>

      <g className="login-robo__torso">
        {/* 躯干：流线体，背部中段隆起（电池舱），前胸收窄衔接头部 */}
        <path
          d="M87 34 C79 27 63 24 50 25 C38 26 31 31 30 39 C29 46 35 51 45 52 C61 54 77 51 86 47 C90 45.5 91.5 42 90.5 38.5 C90 36.4 88.8 34.8 87 34 Z"
          strokeWidth="2.2"
        />
        {/* 电池舱盖缝线 + 背部传感器圆顶 */}
        <path d="M50 25 C44 25.7 39.5 28 36.8 31.5" strokeWidth="1.2" opacity="0.6" />
        <path d="M55 24.3 a3.2 3.2 0 0 1 6.4 0" strokeWidth="1.3" opacity="0.8" />
        {/* 躯干面板缝线 */}
        <path d="M64 25.5 L66.5 51.5" strokeWidth="1" opacity="0.45" />
        {/* 头部：圆角一体化 + 面罩传感器线 + 相机点 */}
        <path
          d="M89 33 C89 30 91 28 94 28 L108 28 C111.5 28 114 30.5 114.5 34 L115 39.5 C115.4 41.8 113.5 43.6 111 43.6 L95 43.6 C91.8 43.6 89.4 41.2 89 38.2 Z"
          strokeWidth="2.2"
        />
        <path d="M93.5 33.5 h14.5" strokeWidth="1.3" opacity="0.85" />
        <circle cx="108.5" cy="38" r="1.3" fill="currentColor" stroke="none" />
        {/* 头顶天线 */}
        <path d="M100 28 L98.5 22.5" strokeWidth="1.4" opacity="0.85" />
        <circle cx="98.3" cy="21.6" r="1.1" fill="currentColor" stroke="none" />
        {/* 尾巴：上翘弧线（尾尖信号灯由外部 beacon 元素点缀） */}
        <path d="M30.5 35 C25.5 32.5 22.5 28 23 22.5" strokeWidth="1.8" opacity="0.9" />
      </g>

      {/* 近侧腿（盖在躯干之上，完整透明度） */}
      <g className="login-robo__leg login-robo__leg--fr">
        <path d="M80 46 L81.5 62" strokeWidth="3.2" />
        <circle cx="81.5" cy="62" r="2.3" strokeWidth="1.6" />
        <g className="login-robo__shank">
          <path d="M81.5 62 L78.5 81" strokeWidth="2" />
          <path d="M75.5 81.5 h6" strokeWidth="2" />
        </g>
      </g>
      <g className="login-robo__leg login-robo__leg--br">
        <path d="M42 46 L43.5 62" strokeWidth="3.2" />
        <circle cx="43.5" cy="62" r="2.3" strokeWidth="1.6" />
        <g className="login-robo__shank">
          <path d="M43.5 62 L40.5 81" strokeWidth="2" />
          <path d="M37.5 81.5 h6" strokeWidth="2" />
        </g>
      </g>
    </svg>
  )
}

/* ---------- 登录页组件 ---------- */

/** 标题全文（打字机逐字显示，glitch 残影取 data-text 全文） */