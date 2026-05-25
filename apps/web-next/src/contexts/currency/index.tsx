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
  // Stores the current user's ID (or null when signed out). Used to:
  // 1. Guard setCurrency upserts against unauthenticated sessions.
  // 2. Discard stale hydration results if auth changes while a SELECT is in-flight.
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Eagerly seed auth state so setCurrency works before INITIAL_SESSION fires.
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      currentUserIdRef.current = session?.user?.id ?? null;
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
        session?.user
      ) {
        const userId = session.user.id;
        currentUserIdRef.current = userId;
        supabaseClient
          .from("user_settings")
          .select("currency")
          .maybeSingle()
          .then(({ data, error }) => {
            // Discard result if auth changed while the query was in-flight
            if (currentUserIdRef.current !== userId) return;
            if (error) {
              console.error(
                "[CurrencyContext] Failed to load currency:",
                error
              );
              return;
            }
            if (data?.currency) {
              setCurrencyState(data.currency);
              localStorage.setItem(CURRENCY_STORAGE_KEY, data.currency);
            }
          });
      } else if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
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
    if (!currentUserIdRef.current) return;
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
