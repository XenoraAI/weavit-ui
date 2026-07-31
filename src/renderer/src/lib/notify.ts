import { notifications } from '@mantine/notifications'
import { errMsg } from './api'

export const notifyOk = (message: string, title = 'Done') =>
  notifications.show({ title, message, color: 'teal' })

export const notifyErr = (e: unknown, title = 'Error') =>
  notifications.show({ title, message: errMsg(e), color: 'red', autoClose: 6000 })
