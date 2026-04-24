import {
  createContext,
  useContext,
  useState,
  useEffect,
  type PropsWithChildren,
} from "react";
import { supabaseClient } from "../../utility/supabaseClient";

export const SUPPORTED_CURRENCIES = [
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "JPY", label: "JPY — Japanese Yen (¥)" },
  { value: "CAD", label: "CAD — Canadian Dollar (C$)" },
  { value: "AUD", label: "AUD — Australian Dollar (A$)" },
  { value: "CHF", label: "CHF — Swiss Franc (Fr)" },
];

const CURRENCY_STORAGE_KEY = "moneylens_currency";
const DEFAULT_CURRENCY = "GBP";

type CurrencyContextType = {
  currency: string;
  setCurrency: (currency: string) => void;
};

export const CurrencyContext = createContext<CurrencyContextType>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => undefined,
});

export const CurrencyContextProvider = ({ children }: PropsWithChildren) => {
  const [currency, setCurrencyState] = useState<string>(() => {
    return localStorage.getItem(CURRENCY_STORAGE_KEY) ?? DEFAULT_CURRENCY;
  });

  // On mount: load from DB, overriding localStorage if DB has a value
  useEffect(() => {
    const loadFromDB = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("user_settings")
          .select("currency")
          .single();
        if (!error && data?.currency) {
          setCurrencyState(data.currency);
          localStorage.setItem(CURRENCY_STORAGE_KEY, data.currency);
        }
      } catch {
        // Silently fall back to localStorage value
      }
    };
    loadFromDB();
  }, []);

  // Keep localStorage in sync
  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }, [currency]);

  const setCurrency = async (newCurrency: string) => {
    setCurrencyState(newCurrency);
    try {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (user) {
        await supabaseClient
          .from("user_settings")
          .upsert({ user_id: user.id, currency: newCurrency });
      }
    } catch {
      // Silently ignore - localStorage is already updated
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
