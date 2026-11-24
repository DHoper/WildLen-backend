/**
 * Bilingual (zh-TW / en) messages for API errors and validation.
 *
 * - `ApiError` carries a message key + params; the error handler renders it in the
 *   request's locale (`?lang=` → `Accept-Language` → zh-TW).
 * - zod schemas either leave messages out (a generic message is built from the issue
 *   code and the field label) or use a key from this file as the custom message.
 */
import type { Request } from 'express'

export const LOCALES = ['zh-TW', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'

type Entry = Record<Locale, string>

const MESSAGES = {
  // ── Generic errors ──
  'error.bad_request': { 'zh-TW': '請求格式錯誤', en: 'Bad request' },
  'error.validation': { 'zh-TW': '輸入資料格式錯誤', en: 'Invalid input' },
  'error.unauthorized': { 'zh-TW': '請先登入', en: 'Please sign in first' },
  'error.forbidden': { 'zh-TW': '沒有權限執行此操作', en: 'You do not have permission to do this' },
  'error.not_found': { 'zh-TW': '找不到此{resource}', en: '{resource} not found' },
  'error.route_not_found': { 'zh-TW': '找不到路徑 {method} {path}', en: 'Route not found: {method} {path}' },
  'error.conflict': { 'zh-TW': '資料重複', en: 'This already exists' },
  'error.relation_missing': { 'zh-TW': '關聯資料不存在', en: 'A related record does not exist' },
  'error.database': { 'zh-TW': '資料庫錯誤', en: 'Database error' },
  'error.internal': { 'zh-TW': '伺服器發生錯誤，請稍後再試', en: 'Something went wrong. Please try again later' },
  'error.unavailable': { 'zh-TW': '服務暫時無法使用', en: 'Service temporarily unavailable' },
  'error.file_too_large': { 'zh-TW': '檔案超過 10MB 上限', en: 'File exceeds the 10 MB limit' },
  'error.upload_failed': { 'zh-TW': '檔案上傳失敗', en: 'File upload failed' },
  'error.invalid_json': { 'zh-TW': 'JSON 格式錯誤', en: 'Malformed JSON' },
  'error.payload_too_large': { 'zh-TW': '請求內容過大', en: 'Request body is too large' },
  'error.too_many_requests': { 'zh-TW': '嘗試次數過多，請稍後再試', en: 'Too many attempts. Please try again later' },

  // ── Auth / account ──
  'auth.email_taken': { 'zh-TW': '此信箱已被註冊', en: 'This email is already registered' },
  'auth.invalid_credentials': { 'zh-TW': '信箱或密碼錯誤', en: 'Incorrect email or password' },
  'auth.wrong_confirm_email': { 'zh-TW': '輸入的信箱與帳號不符', en: 'The email doesn’t match your account' },
  'article.invalid_translation': { 'zh-TW': '找不到要對應的原文文章', en: 'The source article was not found' },
  'article.translation_same_locale': { 'zh-TW': '譯文的語言必須與原文不同', en: 'A translation must be in a different language from the source' },
  'article.translation_exists': { 'zh-TW': '這篇文章已有該語言的版本', en: 'This article already has a version in that language' },
  'translate.disabled': { 'zh-TW': '目前未開放翻譯功能', en: 'Translation is not available' },
  'translate.failed': { 'zh-TW': '翻譯服務暫時無法使用，請稍後再試', en: 'Translation is temporarily unavailable. Please try again later.' },
  'challenge.not_open': { 'zh-TW': '目前不在投稿期間', en: 'This challenge is not accepting entries right now' },
  'challenge.not_voting': { 'zh-TW': '目前不在投票期間', en: 'Voting is not open for this challenge' },
  'challenge.entry_limit': { 'zh-TW': '每人最多投稿 {n} 件作品', en: 'You can enter at most {n} photos' },
  'challenge.vote_limit': { 'zh-TW': '每人最多投 {n} 票', en: 'You can cast at most {n} votes' },
  'challenge.own_entry': { 'zh-TW': '不能投給自己的作品', en: 'You can’t vote for your own entry' },
  'challenge.not_your_photo': { 'zh-TW': '只能投稿自己的照片', en: 'You can only enter your own photos' },
  'challenge.wrong_group': { 'zh-TW': '這張照片的物種類群不符合本次挑戰', en: 'This photo’s species group doesn’t match the challenge' },
  'challenge.already_entered': { 'zh-TW': '這張照片已經投稿過了', en: 'This photo is already entered' },
  'challenge.slug_taken': { 'zh-TW': '網址代稱已被使用', en: 'That slug is already in use' },
  'photo.source_identification': { 'zh-TW': '這筆紀錄的鑑定在 {source} 上進行，請到原始紀錄提出鑑定', en: 'This record is identified on {source}; suggest an identification on the original record' },
  'outing.time_order': { 'zh-TW': '結束時間不能早於開始時間', en: 'The end time can’t be before the start time' },
  'outing.too_long': { 'zh-TW': '一篇日誌最長涵蓋三天，請分成多篇', en: 'A journal can cover at most three days; split it into several' },
  'outing.not_draft': { 'zh-TW': '這篇日誌已經發佈', en: 'This journal has already been published' },
  'outing.observation_title': { 'zh-TW': '第 {n} 筆觀察需要物種或標題', en: 'Observation {n} needs a species or a title' },
  'outing.image_twice': { 'zh-TW': '同一張照片不能放在兩筆觀察中', en: 'A photo can’t be used in two observations' },
  'place.inside_existing': { 'zh-TW': '這個位置已在「{name}」的範圍內，請直接選用該地點', en: 'This location is already inside “{name}”; choose that place instead' },
  'place.proposal_limit': { 'zh-TW': '待審核的地點提案最多 {n} 個', en: 'You can have at most {n} place proposals awaiting review' },
  'place.outside': { 'zh-TW': '觀察位置不在「{name}」的範圍內', en: 'The observation’s location is outside “{name}”' },
  'place.unavailable': { 'zh-TW': '這個地點無法使用', en: 'This place can’t be used' },
  'trip.cancelled': { 'zh-TW': '活動已取消', en: 'This trip has been cancelled' },
  'trip.started': { 'zh-TW': '活動已經開始，無法再報名', en: 'This trip has already started' },
  'trip.organizer_cannot_leave': { 'zh-TW': '主辦人無法退出，請改為取消活動', en: 'Organisers can’t leave — cancel the trip instead' },
  'trip.not_member': { 'zh-TW': '只有參加者可以把照片加入活動相簿', en: 'Only participants can add photos to this trip' },
  'trip.capacity_below_going': { 'zh-TW': '人數上限不能少於已報名的 {n} 人', en: 'Capacity can’t be lower than the {n} people already going' },
  'critique.own_photo': { 'zh-TW': '不能講評自己的作品', en: 'You can’t critique your own photo' },
  'validation.trip_time': { 'zh-TW': '結束時間必須晚於開始時間', en: 'The end must be after the start' },
  'validation.trip_past': { 'zh-TW': '開始時間必須在未來', en: 'The start time must be in the future' },
  'validation.challenge_timeline': { 'zh-TW': '時程順序須為：開始 < 投稿截止 < 投票截止', en: 'Timeline must be start < submission deadline < voting deadline' },
  'auth.google_disabled': { 'zh-TW': '目前未開放 Google 登入', en: 'Google sign-in is not available' },
  'auth.google_invalid': { 'zh-TW': 'Google 登入驗證失敗，請再試一次', en: 'Google sign-in could not be verified. Please try again.' },
  'auth.google_unverified': { 'zh-TW': '此 Google 帳號的信箱尚未驗證', en: 'This Google account’s email address is not verified' },
  'auth.google_already_linked': { 'zh-TW': '此 Google 帳號已連結到其他 WildLens 帳號', en: 'This Google account is linked to another WildLens account' },
  'auth.password_required_to_unlink': { 'zh-TW': '請先設定密碼，才能解除 Google 連結', en: 'Set a password before unlinking Google' },
  'auth.account_missing': { 'zh-TW': '帳號不存在，請重新登入', en: 'Account not found. Please sign in again' },
  'auth.invalid_refresh_token': { 'zh-TW': '登入已失效，請重新登入', en: 'Your session has expired. Please sign in again' },
  'auth.invalid_token': { 'zh-TW': '連結無效或已過期', en: 'This link is invalid or has expired' },
  'auth.email_not_verified': { 'zh-TW': '請先完成 Email 驗證', en: 'Please verify your email address first' },
  'auth.wrong_password': { 'zh-TW': '密碼不正確', en: 'Incorrect password' },
  'auth.wrong_current_password': { 'zh-TW': '目前密碼不正確', en: 'Current password is incorrect' },
  'admin.cannot_demote_self': { 'zh-TW': '不能移除自己的管理員權限', en: 'You cannot remove your own admin role' },
  'admin.cannot_delete_self': { 'zh-TW': '不能刪除自己的帳號', en: 'You cannot delete your own account here' },
  'admin.gear_exists': { 'zh-TW': '目錄中已有同品牌同型號的器材', en: 'That brand and model is already in the catalogue' },
  'admin.gear_alias_taken': { 'zh-TW': '「{alias}」已經對應到 {gear}', en: '“{alias}” already maps to {gear}' },
  'admin.place_slug_taken': { 'zh-TW': '地點代稱已被使用', en: 'That place slug is already in use' },
  'admin.place_merge_target': { 'zh-TW': '只能合併到另一個已上架的地點', en: 'Places can only be merged into another published place' },
  'admin.system_account': { 'zh-TW': '系統帳號不能修改或刪除', en: 'System accounts can’t be changed or deleted' },
  'admin.board_key_taken': { 'zh-TW': '看板代稱已被使用', en: 'That board key is already in use' },
  'admin.board_has_posts': { 'zh-TW': '看板內還有 {n} 則討論，請指定要移往的看板', en: 'This board still has {n} topics — choose a board to move them to' },
  'admin.board_move_target': { 'zh-TW': '無法移往這個看板', en: 'Topics can’t be moved to that board' },
  'admin.challenge_has_votes': { 'zh-TW': '投票已開始，不能再更改投稿截止時間或類群限制', en: 'Voting has started — the submission deadline and group restriction can no longer change' },
  'admin.email_taken': { 'zh-TW': '此信箱已被使用', en: 'This email is already in use' },

  // ── Content ──
  'image.in_use': { 'zh-TW': '圖片 #{id} 已被其他內容使用', en: 'Image #{id} is already used elsewhere' },
  'image.not_allowed': { 'zh-TW': '無法使用圖片 #{id}', en: 'You cannot use image #{id}' },
  'image.missing': { 'zh-TW': '包含不存在的圖片', en: 'Some images do not exist' },
  'image.none': { 'zh-TW': '請選擇要上傳的圖片', en: 'Please choose images to upload' },
  'image.unsupported_type': { 'zh-TW': '僅支援 JPG、PNG、WEBP、HEIC 圖片', en: 'Only JPG, PNG, WEBP and HEIC images are supported' },
  'poll.ended': { 'zh-TW': '此投票已結束', en: 'This poll has ended' },
  'poll.invalid_option': { 'zh-TW': '無效的選項', en: 'Invalid option' },
  'poll.already_voted': { 'zh-TW': '你已經投過票了', en: 'You have already voted' },
  'species.missing': { 'zh-TW': '物種不存在', en: 'Species does not exist' },

  // ── Forum ──
  'forum.unknown_category': { 'zh-TW': '找不到此看板', en: 'This board does not exist' },
  'forum.admin_only': { 'zh-TW': '只有管理員可以在此看板發文', en: 'Only admins can post on this board' },
  'forum.locked': { 'zh-TW': '此主題已鎖定，無法回覆', en: 'This topic is locked and no longer accepts replies' },
  'forum.not_question': { 'zh-TW': '只有提問類型的主題可以採納解答', en: 'Only questions can have an accepted answer' },
  'forum.comment_not_in_post': { 'zh-TW': '此回覆不屬於這個主題', en: 'That reply does not belong to this topic' },
  'comment.parent_mismatch': { 'zh-TW': '回覆的留言不在此內容中', en: 'The comment you are replying to is not on this content' },

  // ── Social / safety ──
  'follow.self': { 'zh-TW': '不能追蹤自己', en: 'You cannot follow yourself' },
  'block.self': { 'zh-TW': '不能封鎖自己', en: 'You cannot block yourself' },
  'block.blocked': { 'zh-TW': '因封鎖關係，無法進行此操作', en: 'You cannot interact with this user' },
  'report.duplicate': { 'zh-TW': '你已檢舉過此內容，我們正在處理', en: 'You have already reported this. We are reviewing it' },
  'report.self': { 'zh-TW': '不能檢舉自己', en: 'You cannot report yourself' },

  // ── Generic validation (built from zod issue codes) ──
  'validation.required': { 'zh-TW': '請填寫{field}', en: '{field} is required' },
  'validation.invalid_type': { 'zh-TW': '{field}格式錯誤', en: '{field} is invalid' },
  'validation.string_min': { 'zh-TW': '{field}至少 {min} 個字', en: '{field} must be at least {min} characters' },
  'validation.string_max': { 'zh-TW': '{field}最多 {max} 個字', en: '{field} must be at most {max} characters' },
  'validation.number_min': { 'zh-TW': '{field}不可小於 {min}', en: '{field} must be at least {min}' },
  'validation.number_max': { 'zh-TW': '{field}不可大於 {max}', en: '{field} must be at most {max}' },
  'validation.array_min': { 'zh-TW': '{field}至少需要 {min} 項', en: '{field} needs at least {min} item(s)' },
  'validation.array_max': { 'zh-TW': '{field}最多 {max} 項', en: '{field} allows at most {max} item(s)' },
  'validation.invalid_format': { 'zh-TW': '{field}格式錯誤', en: '{field} has an invalid format' },
  'validation.url': { 'zh-TW': '{field}必須是有效的網址', en: '{field} must be a valid URL' },
  'validation.invalid_value': { 'zh-TW': '{field}的值無效', en: '{field} has an invalid value' },

  // ── Custom validation ──
  'validation.email': { 'zh-TW': '請輸入有效的信箱', en: 'Please enter a valid email address' },
  'validation.password_letter': { 'zh-TW': '密碼需包含英文字母', en: 'Password must contain a letter' },
  'validation.password_digit': { 'zh-TW': '密碼需包含數字', en: 'Password must contain a number' },
  'validation.tags_unknown': { 'zh-TW': '包含未知的標籤', en: 'Contains unknown tags' },
  'validation.image_required': { 'zh-TW': '至少上傳 1 張照片', en: 'Please upload at least one photo' },
  'validation.taken_at_future': { 'zh-TW': '拍攝時間不可晚於現在', en: 'Date taken cannot be in the future' },
  'validation.content_empty': { 'zh-TW': '內容不可為空', en: 'Content cannot be empty' },
  'validation.content_too_long': { 'zh-TW': '內容過長', en: 'Content is too long' },
  'validation.content_min': { 'zh-TW': '內文至少 5 個字', en: 'Content must be at least 5 characters' },
  'validation.comment_empty': { 'zh-TW': '留言不可為空', en: 'Comment cannot be empty' },
  'validation.poll_ends_soon': { 'zh-TW': '截止時間需至少在一小時後', en: 'The poll must end at least one hour from now' },
  'validation.poll_ends_far': { 'zh-TW': '投票期間最長 90 天', en: 'A poll can run for at most 90 days' },
  'validation.poll_options_unique': { 'zh-TW': '選項不可重複', en: 'Options must be unique' }
} satisfies Record<string, Entry>

export type MessageKey = keyof typeof MESSAGES
export type MessageParams = Record<string, string | number>

const RESOURCES = {
  resource: { 'zh-TW': '資源', en: 'Resource' },
  photo: { 'zh-TW': '照片', en: 'Photo' },
  article: { 'zh-TW': '文章', en: 'Article' },
  post: { 'zh-TW': '貼文', en: 'Post' },
  comment: { 'zh-TW': '留言', en: 'Comment' },
  user: { 'zh-TW': '使用者', en: 'User' },
  poll: { 'zh-TW': '投票', en: 'Poll' },
  species: { 'zh-TW': '物種', en: 'Species' },
  image: { 'zh-TW': '圖片', en: 'Image' },
  report: { 'zh-TW': '檢舉', en: 'Report' },
  identification: { 'zh-TW': '鑑定', en: 'Identification' },
  category: { 'zh-TW': '看板', en: 'Board' },
  challenge: { 'zh-TW': '挑戰', en: 'Challenge' },
  trip: { 'zh-TW': '活動', en: 'Trip' },
  gear: { 'zh-TW': '器材', en: 'Gear' },
  place: { 'zh-TW': '地點', en: 'Place' },
  outing: { 'zh-TW': '野外日誌', en: 'Field journal' }
} satisfies Record<string, Entry>
export type ResourceKey = keyof typeof RESOURCES

/** Display names of request fields, used in generic validation messages. */
const FIELDS: Record<string, Entry> = {
  title: { 'zh-TW': '標題', en: 'Title' },
  subtitle: { 'zh-TW': '副標題', en: 'Subtitle' },
  description: { 'zh-TW': '描述', en: 'Description' },
  descriptionEn: { 'zh-TW': '英文描述', en: 'English description' },
  locationName: { 'zh-TW': '拍攝地點', en: 'Location' },
  latitude: { 'zh-TW': '緯度', en: 'Latitude' },
  longitude: { 'zh-TW': '經度', en: 'Longitude' },
  imageIds: { 'zh-TW': '照片', en: 'Photos' },
  speciesId: { 'zh-TW': '物種', en: 'Species' },
  takenAt: { 'zh-TW': '拍攝時間', en: 'Date taken' },
  exif: { 'zh-TW': '相機資訊', en: 'Camera info' },
  camera: { 'zh-TW': '相機', en: 'Camera' },
  lens: { 'zh-TW': '鏡頭', en: 'Lens' },
  focalLength: { 'zh-TW': '焦距', en: 'Focal length' },
  aperture: { 'zh-TW': '光圈', en: 'Aperture' },
  shutterSpeed: { 'zh-TW': '快門', en: 'Shutter speed' },
  iso: { 'zh-TW': 'ISO', en: 'ISO' },
  locationPrecision: { 'zh-TW': '位置精度', en: 'Location precision' },
  email: { 'zh-TW': '信箱', en: 'Email' },
  password: { 'zh-TW': '密碼', en: 'Password' },
  newPassword: { 'zh-TW': '新密碼', en: 'New password' },
  currentPassword: { 'zh-TW': '目前密碼', en: 'Current password' },
  username: { 'zh-TW': '名稱', en: 'Name' },
  avatarIndex: { 'zh-TW': '頭像', en: 'Avatar' },
  bio: { 'zh-TW': '自我介紹', en: 'Bio' },
  interests: { 'zh-TW': '興趣標籤', en: 'Interests' },
  tags: { 'zh-TW': '標籤', en: 'Tags' },
  content: { 'zh-TW': '內容', en: 'Content' },
  ops: { 'zh-TW': '內容', en: 'Content' },
  coverImageUrl: { 'zh-TW': '封面圖片', en: 'Cover image' },
  status: { 'zh-TW': '狀態', en: 'Status' },
  locale: { 'zh-TW': '語言', en: 'Language' },
  endsAt: { 'zh-TW': '截止時間', en: 'End time' },
  options: { 'zh-TW': '選項', en: 'Options' },
  optionId: { 'zh-TW': '選項', en: 'Option' },
  commonName: { 'zh-TW': '中文名', en: 'Chinese name' },
  scientificName: { 'zh-TW': '學名', en: 'Scientific name' },
  englishName: { 'zh-TW': '英文名', en: 'English name' },
  group: { 'zh-TW': '類群', en: 'Group' },
  sensitive: { 'zh-TW': '敏感物種', en: 'Sensitive' },
  token: { 'zh-TW': '驗證碼', en: 'Token' },
  refreshToken: { 'zh-TW': 'Refresh token', en: 'Refresh token' },
  targetType: { 'zh-TW': '檢舉對象類型', en: 'Target type' },
  targetId: { 'zh-TW': '檢舉對象', en: 'Target' },
  reason: { 'zh-TW': '檢舉原因', en: 'Reason' },
  note: { 'zh-TW': '補充說明', en: 'Note' },
  resolutionNote: { 'zh-TW': '處理說明', en: 'Resolution note' },
  comment: { 'zh-TW': '說明', en: 'Comment' },
  categoryKey: { 'zh-TW': '看板', en: 'Board' },
  type: { 'zh-TW': '類型', en: 'Type' },
  parentId: { 'zh-TW': '回覆對象', en: 'Parent comment' },
  commentId: { 'zh-TW': '回覆', en: 'Reply' },
  pinned: { 'zh-TW': '置頂', en: 'Pinned' },
  locked: { 'zh-TW': '鎖定', en: 'Locked' },
  days: { 'zh-TW': '天數', en: 'Days' },
  month: { 'zh-TW': '月份', en: 'Month' },
  page: { 'zh-TW': '頁數', en: 'Page' },
  pageSize: { 'zh-TW': '每頁筆數', en: 'Page size' },
  limit: { 'zh-TW': '數量', en: 'Limit' },
  q: { 'zh-TW': '搜尋關鍵字', en: 'Search' }
}

const interpolate = (text: string, params?: MessageParams) =>
  params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text

export const isMessageKey = (key: string): key is MessageKey => key in MESSAGES

export const resourceLabel = (key: ResourceKey, locale: Locale) => RESOURCES[key][locale]
export const fieldLabel = (field: string, locale: Locale) => FIELDS[field]?.[locale] ?? field

/** Renders a message; `resource` / `field` params are localised automatically. */
export const t = (key: MessageKey, locale: Locale = DEFAULT_LOCALE, params?: MessageParams) => {
  const p = params && { ...params }
  if (p && typeof p.resource === 'string' && p.resource in RESOURCES) {
    p.resource = resourceLabel(p.resource as ResourceKey, locale)
  }
  if (p && typeof p.field === 'string') p.field = fieldLabel(p.field, locale)
  return interpolate(MESSAGES[key][locale], p)
}

export const toLocale = (value: unknown): Locale | undefined => {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (v.startsWith('en')) return 'en'
  if (v.startsWith('zh')) return 'zh-TW'
  return undefined
}

/** `?lang=` wins, then the best match in Accept-Language, then zh-TW. */
export const localeFromRequest = (req: Request): Locale => {
  const fromQuery = toLocale(req.query?.lang)
  if (fromQuery) return fromQuery
  const header = req.headers['accept-language']
  if (header) {
    const ranked = header
      .split(',')
      .map((part) => {
        const [tag = '', ...rest] = part.trim().split(';')
        const q = rest.find((r) => r.trim().startsWith('q='))
        return { tag, q: q ? Number(q.trim().slice(2)) || 0 : 1 }
      })
      .sort((a, b) => b.q - a.q)
    for (const { tag } of ranked) {
      const locale = toLocale(tag)
      if (locale) return locale
    }
  }
  return DEFAULT_LOCALE
}
