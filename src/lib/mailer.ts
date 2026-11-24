/**
 * Outgoing e-mail. Sends through Resend's HTTP API when RESEND_API_KEY is set;
 * otherwise the message (including its link) is written to the log, so the flows
 * work in development without an e-mail provider. In tests, mail is kept in `outbox`.
 */
import { env } from '../config/env'
import { logger } from './logger'
import type { Locale } from './i18n'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

/** Messages "sent" while NODE_ENV=test (newest last). */
export const outbox: Mail[] = []

export async function sendMail(mail: Mail) {
  if (env.NODE_ENV === 'test') {
    outbox.push(mail)
    return
  }
  if (!env.RESEND_API_KEY) {
    logger.info({ to: mail.to, subject: mail.subject }, `📧 (not sent: RESEND_API_KEY unset)\n${mail.text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html })
  })
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`)
}

/** Fire-and-forget: e-mail problems are logged, never surfaced to the API caller. */
export const sendMailInBackground = (mail: Mail | Promise<Mail>) => {
  void Promise.resolve(mail)
    .then(sendMail)
    .catch((err) => logger.error({ err }, 'Failed to send e-mail'))
}

/** Website link, with the `/en` prefix for English users. */
export const appLink = (locale: Locale, path: string) =>
  `${env.APP_URL.replace(/\/$/, '')}${locale === 'en' ? '/en' : ''}${path}`

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const layout = (greeting: string, body: string, action: string, url: string, footer: string) => ({
  text: `${greeting}\n\n${body}\n\n${action}: ${url}\n\n${footer}\n\n— WildLens`,
  html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#1f2a1f">
<p>${escape(greeting)}</p><p>${escape(body)}</p>
<p><a href="${escape(url)}" style="display:inline-block;padding:10px 20px;background:#3d6b3d;color:#fff;border-radius:999px;text-decoration:none">${escape(action)}</a></p>
<p style="font-size:12px;color:#6b6b6b">${escape(footer)}<br>${escape(url)}</p><p>— WildLens</p></div>`
})

export const templates = {
  verifyEmail(locale: Locale, name: string, url: string): Omit<Mail, 'to'> {
    return locale === 'en'
      ? {
          subject: 'Verify your WildLens email address',
          ...layout(`Hi ${name},`, 'Welcome to WildLens! Please confirm your email address. This link is valid for 48 hours.', 'Verify email', url, "If you didn't create an account, you can ignore this email.")
        }
      : {
          subject: '請驗證你的 WildLens 信箱',
          ...layout(`${name} 你好，`, '歡迎加入 WildLens！請點擊下方連結完成信箱驗證，連結 48 小時內有效。', '驗證信箱', url, '如果你沒有註冊 WildLens，請忽略這封信。')
        }
  },
  resetPassword(locale: Locale, name: string, url: string): Omit<Mail, 'to'> {
    return locale === 'en'
      ? {
          subject: 'Reset your WildLens password',
          ...layout(`Hi ${name},`, 'We received a request to reset your password. This link is valid for 1 hour and can be used once.', 'Reset password', url, "If you didn't request this, you can ignore this email — your password won't change.")
        }
      : {
          subject: '重設你的 WildLens 密碼',
          ...layout(`${name} 你好，`, '我們收到重設密碼的請求。下方連結 1 小時內有效，且只能使用一次。', '重設密碼', url, '如果不是你本人申請，請忽略這封信，你的密碼不會變更。')
        }
  }
}
