import "@ant-design/v5-patch-for-react-19";

import React from "react";
import { createRoot } from "react-dom/client";
import dayjs from "dayjs";
import "dayjs/locale/en-gb";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import App from "./App";
import "./styles/global.css";

dayjs.locale("en-gb");

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
