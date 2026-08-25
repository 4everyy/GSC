export type AlarmColor = 'orange' | 'blue' | 'red'

export interface AlarmType {
  badge: string
  color: AlarmColor
}