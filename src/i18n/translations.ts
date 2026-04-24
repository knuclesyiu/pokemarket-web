/**
 * PokeMarket — Translation strings
 * zh-HK: 繁體中文 (default)
 * zh-CN: 簡體中文
 * en: English
 */

export type Language = 'zh-HK' | 'zh-CN' | 'en';

export interface Translations {
  // Tabs
  tab_market: string;
  tab_chat: string;
  tab_wallet: string;
  tab_portfolio: string;
  tab_profile: string;

  // Market
  market_title: string;
  market_search: string;
  market_filter_all: string;
  market_swap: string;

  // Portfolio
  portfolio_title: string;
  portfolio_total_value: string;
  portfolio_cost: string;
  portfolio_pnl: string;
  portfolio_holdings: string;
  portfolio_history: string;
  portfolio_sell_btn: string;

  // Wallet
  wallet_title: string;
  wallet_balance: string;
  wallet_in_escrow: string;
  wallet_available: string;
  wallet_all: string;
  wallet_in_escrow_tab: string;

  // Profile
  profile_title: string;
  profile_member_since: string;
  profile_edit: string;
  profile_contact: string;
  profile_phone: string;
  profile_email: string;
  profile_rating: string;
  profile_positive: string;
  profile_negative: string;
  profile_rate: string;
  profile_no_reviews: string;
  profile_preferences: string;
  profile_language: string;
  profile_notifications: string;
  profile_security: string;
  profile_change_pin: string;
  profile_set_pin: string;
  profile_sign_out: string;

  // Auth
  auth_login: string;
  auth_register: string;
  auth_phone: string;
  auth_email: string;
  auth_password: string;
  auth_send_otp: string;
  auth_verify: string;
  auth_resend: string;
  auth_no_account: string;

  // Common
  save: string;
  cancel: string;
  confirm: string;
  error: string;
  success: string;
  loading: string;
}

export const translations: Record<Language, Translations> = {
  'zh-HK': {
    tab_market: '市場',
    tab_chat: '訊息',
    tab_wallet: '錢包',
    tab_portfolio: '收藏',
    tab_profile: '個人',
    market_title: '市場',
    market_search: '搜尋 Pokemon 卡片...',
    market_filter_all: '全部',
    market_swap: '交換',
    portfolio_title: '我的收藏',
    portfolio_total_value: '總市值',
    portfolio_cost: '成本',
    portfolio_pnl: '帳面盈虧',
    portfolio_holdings: '持有卡牌',
    portfolio_history: '成交記錄',
    portfolio_sell_btn: '📦 放售卡牌',
    wallet_title: '錢包',
    wallet_balance: '帳戶結餘',
    wallet_in_escrow: '擔保中',
    wallet_available: '可用',
    wallet_all: '全部',
    wallet_in_escrow_tab: '擔保中',
    profile_title: '個人',
    profile_member_since: '會員since',
    profile_edit: '編輯個人資料 →',
    profile_contact: '📱 聯絡方式',
    profile_phone: '電話',
    profile_email: 'Email',
    profile_rating: '⭐ 信用評價',
    profile_positive: '👍 好評',
    profile_negative: '👎 差評',
    profile_rate: '好評率',
    profile_no_reviews: '暫時未有評價，快完成第一單交易啦 🎉',
    profile_preferences: '⚙️ 偏好設定',
    profile_language: '🌐 語言',
    profile_notifications: '🔔 通知',
    profile_security: '🔐 安全性',
    profile_change_pin: '更改交易密碼',
    profile_set_pin: '設定交易密碼',
    profile_sign_out: '登出帳戶',
    auth_login: '登入 / 註冊',
    auth_register: '完善個人資料',
    auth_phone: '📱 電話',
    auth_email: '✉️ Email',
    auth_password: '密碼',
    auth_send_otp: '發送驗證碼',
    auth_verify: '驗證登入',
    auth_resend: '重發驗證碼',
    auth_no_account: '未有帳戶？立即註冊 →',
    save: '儲存',
    cancel: '取消',
    confirm: '確認',
    error: '錯誤',
    success: '成功',
    loading: '載入中...',
  },
  'zh-CN': {
    tab_market: '市场',
    tab_chat: '消息',
    tab_wallet: '钱包',
    tab_portfolio: '收藏',
    tab_profile: '个人',
    market_title: '市场',
    market_search: '搜索 Pokemon 卡牌...',
    market_filter_all: '全部',
    market_swap: '交换',
    portfolio_title: '我的收藏',
    portfolio_total_value: '总市值',
    portfolio_cost: '成本',
    portfolio_pnl: '帐面盈亏',
    portfolio_holdings: '持有卡牌',
    portfolio_history: '成交记录',
    portfolio_sell_btn: '📦 放售卡牌',
    wallet_title: '钱包',
    wallet_balance: '帐户结余',
    wallet_in_escrow: '托管中',
    wallet_available: '可用',
    wallet_all: '全部',
    wallet_in_escrow_tab: '托管中',
    profile_title: '个人',
    profile_member_since: '会员since',
    profile_edit: '编辑个人资料 →',
    profile_contact: '📱 联络方式',
    profile_phone: '电话',
    profile_email: 'Email',
    profile_rating: '⭐ 信用评价',
    profile_positive: '👍 好评',
    profile_negative: '👎 差评',
    profile_rate: '好评率',
    profile_no_reviews: '暂时未有评价，快完成第一单交易啦 🎉',
    profile_preferences: '⚙️ 偏好设定',
    profile_language: '🌐 语言',
    profile_notifications: '🔔 通知',
    profile_security: '🔐 安全性',
    profile_change_pin: '更改交易密码',
    profile_set_pin: '设定交易密码',
    profile_sign_out: '登出帐户',
    auth_login: '登入 / 注册',
    auth_register: '完善个人资料',
    auth_phone: '📱 电话',
    auth_email: '✉️ Email',
    auth_password: '密码',
    auth_send_otp: '发送验证码',
    auth_verify: '验证登入',
    auth_resend: '重发验证码',
    auth_no_account: '未有帐户？立即注册 →',
    save: '储存',
    cancel: '取消',
    confirm: '确认',
    error: '错误',
    success: '成功',
    loading: '载入中...',
  },
  'en': {
    tab_market: 'Market',
    tab_chat: 'Chat',
    tab_wallet: 'Wallet',
    tab_portfolio: 'Portfolio',
    tab_profile: 'Profile',
    market_title: 'Market',
    market_search: 'Search Pokemon cards...',
    market_filter_all: 'All',
    market_swap: 'Swap',
    portfolio_title: 'My Portfolio',
    portfolio_total_value: 'Total Value',
    portfolio_cost: 'Cost',
    portfolio_pnl: 'P&L',
    portfolio_holdings: 'Holdings',
    portfolio_history: 'History',
    portfolio_sell_btn: '📦 Sell Card',
    wallet_title: 'Wallet',
    wallet_balance: 'Balance',
    wallet_in_escrow: 'In Escrow',
    wallet_available: 'Available',
    wallet_all: 'All',
    wallet_in_escrow_tab: 'Escrow',
    profile_title: 'Profile',
    profile_member_since: 'Member since',
    profile_edit: 'Edit Profile →',
    profile_contact: '📱 Contact',
    profile_phone: 'Phone',
    profile_email: 'Email',
    profile_rating: '⭐ Rating',
    profile_positive: '👍 Positive',
    profile_negative: '👎 Negative',
    profile_rate: 'Positive Rate',
    profile_no_reviews: 'No reviews yet — complete your first trade 🎉',
    profile_preferences: '⚙️ Preferences',
    profile_language: '🌐 Language',
    profile_notifications: '🔔 Notifications',
    profile_security: '🔐 Security',
    profile_change_pin: 'Change PIN',
    profile_set_pin: 'Set PIN',
    profile_sign_out: 'Sign Out',
    auth_login: 'Login / Register',
    auth_register: 'Complete Profile',
    auth_phone: '📱 Phone',
    auth_email: '✉️ Email',
    auth_password: 'Password',
    auth_send_otp: 'Send Code',
    auth_verify: 'Verify',
    auth_resend: 'Resend Code',
    auth_no_account: 'No account? Register →',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    error: 'Error',
    success: 'Success',
    loading: 'Loading...',
  },
};
