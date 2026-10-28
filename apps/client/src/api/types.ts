// Shapes of the API responses (services/api, docs/api.md). Money is a string: "350.00".

export type Money = string;

export type Venue = {
  id: string;
  code: string;
  title: string;
  address: string;
  city: string;
  phone: string;
  latitude: number;
  longitude: number;
  timezone: string;
  hours_text: string;
  is_open: boolean;
  closes_at: string | null;
  opens_at: string | null;
  cook_minutes: number;
  pickup_enabled: boolean;
};

export type Zone = {
  id: string;
  venue_id: string;
  title: string;
  color: string;
  polygon: [number, number][];
  delivery_fee: Money;
  free_delivery_from: Money | null;
  min_order_amount: Money;
  eta_minutes: number;
  priority: number;
  is_active: boolean;
};

export type ModifierOption = { id: string; title: string; price_delta: Money; weight: string };

export type ModifierGroup = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  kind: "choice" | "addon" | "remove";
  required: boolean;
  max_quantity: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  slug: string;
  category_id: string;
  title: string;
  description: string;
  composition: string;
  weight: string;
  price: Money;
  image_url: string | null;
  badges: string[];
  cook_minutes: number | null;
  is_available: boolean;
  modifier_groups: ModifierGroup[];
};

export type Category = { id: string; slug: string; title: string };

export type Menu = {
  venue_id: string | null;
  venue: Venue | null;
  prices_final: boolean;
  categories: Category[];
  items: MenuItem[];
};

export type AppConfig = {
  brand_name: string;
  currency: string;
  min_supported_app_version: string;
  ios_store_url: string;
  android_store_url: string;
  payment_methods: PaymentMethod[];
  support_phone: string;
  bonus: {
    levels: BonusLevel[];
    max_redeem_percent: number;
    welcome?: number;
    referral?: { enabled: boolean; friend: number; referrer: number; min_order: number };
  };
  telegram_login: boolean;
  consent_version?: string;
  auth?: { phone: boolean; telegram: boolean; google: boolean };
};

export type PaymentMethod = "cash" | "card_on_delivery" | "online";
export type Fulfillment = "delivery" | "pickup";

export type QuotedModifier = { id: string; title: string; group: string; kind: ModifierGroup["kind"]; price_delta: Money; quantity: number };

export type QuoteLine = {
  menu_item_id: string;
  title: string;
  image_url: string | null;
  unit_price: Money;
  quantity: number;
  line_total: Money;
  modifiers: QuotedModifier[];
  is_available: boolean;
};

export type Problem = { code: string; message: string; details: Record<string, unknown> };

export type Quote = {
  venue: Venue;
  zone: Zone | null;
  fulfillment: Fulfillment;
  items: QuoteLine[];
  items_total: Money;
  discount_total: Money;
  bonus_spent: Money;
  bonus_available: Money | null;
  delivery_fee: Money | null;
  total_amount: Money;
  promo: { code: string; applied: boolean; label?: string; message: string } | null;
  min_order_amount: Money | null;
  free_delivery_from: Money | null;
  promised_at: string | null;
  scheduled_for: string | null;
  slots: string[];
  bonus_accrual: Money;
  problems: Problem[];
  warnings: string[];
  can_order: boolean;
};

export type TimelineStep = { status: string; title: string; state: "done" | "now" | "todo"; at: string | null };

export type OrderStatus = "pending_payment" | "new" | "confirmed" | "preparing" | "ready" | "delivering" | "completed" | "cancelled" | "rejected";

export type Order = {
  id: string;
  number: string;
  status: OrderStatus;
  status_label: string;
  fulfillment: Fulfillment;
  source: string;
  created_at: string;
  updated_at: string;
  promised_at: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  venue: { id: string; title: string; address: string; phone: string; latitude: number; longitude: number } | null;
  items: Omit<QuoteLine, "is_available">[];
  items_total: Money;
  discount_total: Money;
  bonus_spent: Money;
  delivery_fee: Money;
  total_amount: Money;
  promo_code: string | null;
  payment_method: PaymentMethod;
  payment_label: string;
  payment_status: string;
  can_pay?: boolean;
  address_text: string;
  address_details: Partial<AddressDetails>;
  comment: string;
  cancel_reason: string;
  can_cancel: boolean;
  is_active: boolean;
  timeline: TimelineStep[];
  bonus_accrued: Money | null;
};

export type OrderStatusLite = Pick<
  Order,
  "id" | "number" | "status" | "status_label" | "promised_at" | "updated_at" | "can_cancel" | "is_active" | "timeline" | "cancel_reason"
>;

export type AddressDetails = { entrance: string; floor: string; apartment: string; intercom: string };

export type SavedAddress = AddressDetails & {
  id: string;
  label: string;
  text: string;
  latitude: number;
  longitude: number;
  comment: string;
  is_default: boolean;
};

export type GeoResult = { title: string; subtitle: string; text: string; latitude: number; longitude: number; precise: boolean };

export type Customer = {
  id: string;
  phone: string | null;
  phone_display: string;
  name: string;
  email?: string | null;
  telegram_linked: boolean;
  google_linked?: boolean;
  notify_status: boolean;
  notify_bonus: boolean;
  notify_promo: boolean;
};

export type Tokens = { access_token: string; refresh_token: string; expires_at: string; token_type: string };

export type BonusLevel = { title: string; threshold: number; percent: number };

export type Loyalty = {
  balance: Money;
  level: BonusLevel;
  next_level: BonusLevel | null;
  spent_90_days: Money;
  to_next_level: Money | null;
  levels: BonusLevel[];
  max_redeem_percent: number;
  history: { id: string; kind: string; amount: Money; comment: string; created_at: string }[];
};

export type Promotion = {
  id: string;
  title: string;
  text: string;
  accent: "brand" | "sesame" | "good" | "info";
  action: "none" | "promo" | "referral" | "welcome";
  promo_code: string | null;
};

export type Referral = {
  enabled: boolean;
  code: string;
  link: string;
  friend_bonus: number;
  referrer_bonus: number;
  min_order: number;
  invited: number;
  rewarded: number;
  earned: Money;
  can_apply: boolean;
  applied: boolean;
};
