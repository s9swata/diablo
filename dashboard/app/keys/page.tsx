import { fetchKeys, KeyRecord } from '@/lib/api'
import { actionCreateKey, actionRevokeKey } from './actions'
import KeysClient from './KeysClient'

export default async function KeysPage() {
  const adminKey = process.env.ADMIN_KEY!
  const keys = await fetchKeys(adminKey)
  return <KeysClient keys={keys} createKey={actionCreateKey} revokeKey={actionRevokeKey} />
}