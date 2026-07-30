export type AlarmColor = 'orange' | 'blue' | 'green' | 'red'

export interface AlarmType {
  badge: string
  color: AlarmColor
}