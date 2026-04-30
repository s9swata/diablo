'use server'

import { revalidatePath } from 'next/cache'
import { createKey, revokeKey } from '@/lib/api'

const ADMIN_KEY = process.env.ADMIN_KEY!

export async function actionCreateKey(formData: FormData) {
  const name = (formData.get('name') as string)?.trim() || 'unnamed'
  const key = await createKey(ADMIN_KEY, name)
  revalidatePath('/keys')
  return key  // returned to client so we can show the token once
}

export async function actionRevokeKey(formData: FormData) {
  const token = formData.get('token') as string
  await revokeKey(ADMIN_KEY, token)
  revalidatePath('/keys')
}