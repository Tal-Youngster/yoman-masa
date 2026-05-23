/**
 * Curated travel-common currencies.
 *
 * Not exhaustive ISO 4217 — picked to cover the vast majority of trips while
 * keeping the dropdown scannable. `country` is an ISO 3166-1 alpha-2 code used
 * only to render a representative flag; for multi-country currencies it points
 * to the most populous issuer. `null` means no single representative country
 * (e.g. XAF/XOF) — UI should render a neutral globe glyph.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  country: string | null;
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'AED', name: 'UAE Dirham', country: 'AE' },
  { code: 'ARS', name: 'Argentine Peso', country: 'AR' },
  { code: 'AUD', name: 'Australian Dollar', country: 'AU' },
  { code: 'BDT', name: 'Bangladeshi Taka', country: 'BD' },
  { code: 'BGN', name: 'Bulgarian Lev', country: 'BG' },
  { code: 'BRL', name: 'Brazilian Real', country: 'BR' },
  { code: 'CAD', name: 'Canadian Dollar', country: 'CA' },
  { code: 'CHF', name: 'Swiss Franc', country: 'CH' },
  { code: 'CLP', name: 'Chilean Peso', country: 'CL' },
  { code: 'CNY', name: 'Chinese Yuan', country: 'CN' },
  { code: 'COP', name: 'Colombian Peso', country: 'CO' },
  { code: 'CZK', name: 'Czech Koruna', country: 'CZ' },
  { code: 'DKK', name: 'Danish Krone', country: 'DK' },
  { code: 'EGP', name: 'Egyptian Pound', country: 'EG' },
  { code: 'EUR', name: 'Euro', country: 'EU' },
  { code: 'GBP', name: 'British Pound', country: 'GB' },
  { code: 'GEL', name: 'Georgian Lari', country: 'GE' },
  { code: 'HKD', name: 'Hong Kong Dollar', country: 'HK' },
  { code: 'HUF', name: 'Hungarian Forint', country: 'HU' },
  { code: 'IDR', name: 'Indonesian Rupiah', country: 'ID' },
  { code: 'ILS', name: 'Israeli New Shekel', country: 'IL' },
  { code: 'INR', name: 'Indian Rupee', country: 'IN' },
  { code: 'ISK', name: 'Icelandic Króna', country: 'IS' },
  { code: 'JOD', name: 'Jordanian Dinar', country: 'JO' },
  { code: 'JPY', name: 'Japanese Yen', country: 'JP' },
  { code: 'KES', name: 'Kenyan Shilling', country: 'KE' },
  { code: 'KRW', name: 'South Korean Won', country: 'KR' },
  { code: 'KWD', name: 'Kuwaiti Dinar', country: 'KW' },
  { code: 'KZT', name: 'Kazakhstani Tenge', country: 'KZ' },
  { code: 'LAK', name: 'Lao Kip', country: 'LA' },
  { code: 'LKR', name: 'Sri Lankan Rupee', country: 'LK' },
  { code: 'MAD', name: 'Moroccan Dirham', country: 'MA' },
  { code: 'MXN', name: 'Mexican Peso', country: 'MX' },
  { code: 'MYR', name: 'Malaysian Ringgit', country: 'MY' },
  { code: 'NOK', name: 'Norwegian Krone', country: 'NO' },
  { code: 'NPR', name: 'Nepalese Rupee', country: 'NP' },
  { code: 'NZD', name: 'New Zealand Dollar', country: 'NZ' },
  { code: 'PEN', name: 'Peruvian Sol', country: 'PE' },
  { code: 'PHP', name: 'Philippine Peso', country: 'PH' },
  { code: 'PKR', name: 'Pakistani Rupee', country: 'PK' },
  { code: 'PLN', name: 'Polish Złoty', country: 'PL' },
  { code: 'QAR', name: 'Qatari Riyal', country: 'QA' },
  { code: 'RON', name: 'Romanian Leu', country: 'RO' },
  { code: 'RSD', name: 'Serbian Dinar', country: 'RS' },
  { code: 'RUB', name: 'Russian Ruble', country: 'RU' },
  { code: 'SAR', name: 'Saudi Riyal', country: 'SA' },
  { code: 'SEK', name: 'Swedish Krona', country: 'SE' },
  { code: 'SGD', name: 'Singapore Dollar', country: 'SG' },
  { code: 'THB', name: 'Thai Baht', country: 'TH' },
  { code: 'TRY', name: 'Turkish Lira', country: 'TR' },
  { code: 'TWD', name: 'New Taiwan Dollar', country: 'TW' },
  { code: 'TZS', name: 'Tanzanian Shilling', country: 'TZ' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', country: 'UA' },
  { code: 'USD', name: 'US Dollar', country: 'US' },
  { code: 'VND', name: 'Vietnamese Đồng', country: 'VN' },
  { code: 'ZAR', name: 'South African Rand', country: 'ZA' },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function findCurrency(code: string): CurrencyInfo | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function currencyName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code;
}

export function currencyCountry(code: string): string | null {
  return BY_CODE.get(code.toUpperCase())?.country ?? null;
}
