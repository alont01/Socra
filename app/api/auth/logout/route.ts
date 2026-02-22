import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('token')
  response.cookies.delete('next-auth.session-token')
  response.cookies.delete('__Secure-next-auth.session-token')
  return response
}
