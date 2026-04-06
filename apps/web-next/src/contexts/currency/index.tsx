import {
  createContext,
  useContext,
  useState,
  useEffect,
  type PropsWithChildren,
} from "react";

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
    return (
      localStorage.getItem(CURRENCY_STORAGE_KEY) ?? DEFAULT_CURRENCY
    );
  });

  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }, [currency]);

  const setCurrency = (newCurrency: string) => {
    setCurrencyState(newCurrency);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
