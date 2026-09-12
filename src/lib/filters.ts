import {z} from 'zod'

export const filterString = (value: string): string => JSON.stringify(value)

export function filterGuid(value: string, flag: string): string {
  if (!z.string().uuid().safeParse(value).success) throw new Error(`--${flag} must be a UUID`)
  return `guid(${filterString(value)})`
}
