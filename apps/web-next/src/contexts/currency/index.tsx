import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  type PropsWithChildren,
} from "react";
import { supabaseClient } from "../../utility";

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
  // Track whether the user is currently authenticated so setCurrency can skip
  // the upsert for unauthenticated sessions (avoids RLS errors + wasted requests).
  const isAuthenticatedRef = useRef(false);

  // Hydrate from Supabase on auth state changes (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT).
  // This ensures cross-device sync: server value always wins on session start.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
        session?.user
      ) {
        isAuthenticatedRef.current = true;
        supabaseClient
          .from("user_settings")
          .select("currency")
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              console.error("[CurrencyContext] Failed to load currency:", error);
              return;
            }
            if (data?.currency) {
              setCurrencyState(data.currency);
              localStorage.setItem(CURRENCY_STORAGE_KEY, data.currency);
            }
          });
      } else if (event === "SIGNED_OUT") {
        isAuthenticatedRef.current = false;
        const stored =
          localStorage.getItem(CURRENCY_STORAGE_KEY) ?? DEFAULT_CURRENCY;
        setCurrencyState(stored);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setCurrency = (newCurrency: string) => {
    // Optimistic update: apply immediately to state and localStorage
    setCurrencyState(newCurrency);
    localStorage.setItem(CURRENCY_STORAGE_KEY, newCurrency);

    // Only persist to Supabase when authenticated; user_id set by DB trigger
    if (!isAuthenticatedRef.current) return;
    supabaseClient
      .from("user_settings")
      .upsert({ currency: newCurrency }, { onConflict: "user_id" })
      .then(({ error }) => {
        if (error) {
          console.error("[CurrencyContext] Failed to save currency:", error);
        }
      });
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
